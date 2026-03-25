import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizePersistedSettings } from '../../../../../features/settings/settingsSchema';
import {
  isAiRuntimeConfigComplete,
  resolveSharedAiConfig,
} from '../../../../../server/ai/runtimeConfig';
import { resolveAiConfigFingerprints } from '../../../../../server/ai/configFingerprints';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getArticleById } from '../../../../../server/repositories/articlesRepo';
import {
  getActiveAiSummarySessionByArticleId,
  markAiSummarySessionSuperseded,
  upsertAiSummarySession,
} from '../../../../../server/repositories/articleAiSummaryRepo';
import {
  getArticleTasksByArticleId,
  type ArticleTaskRow,
  upsertTaskQueued,
} from '../../../../../server/repositories/articleTasksRepo';
import { getFeedFullTextOnOpenEnabled } from '../../../../../server/repositories/feedsRepo';
import { getAiApiKey, getUiSettings } from '../../../../../server/repositories/settingsRepo';
import { writeUserOperationStartedLog } from '../../../../../server/logging/userOperationLogger';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { JOB_AI_SUMMARIZE } from '../../../../../server/queue/jobs';
import {
  getUsableFulltextHtml,
  isFulltextPending,
} from '../../../../../server/fulltext/fulltextVerification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});
const bodySchema = z.object({
  force: z.boolean().optional(),
});
const SUMMARY_TASK_STALE_MS = 10 * 60 * 1000;

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function pickSummarySourceText(input: {
  contentFullHtml: string | null;
  contentHtml: string | null;
  summary: string | null;
}): string {
  const source = input.contentFullHtml ?? input.contentHtml ?? input.summary ?? '';
  const plain = htmlToPlainText(source);
  return plain || source || 'missing-content';
}

function buildSessionSnapshot(
  session: Awaited<ReturnType<typeof getActiveAiSummarySessionByArticleId>>,
) {
  if (!session) return null;
  return {
    id: session.id,
    status: session.status,
    draftText: session.draftText,
    finalText: session.finalText,
    errorCode: session.errorCode,
    errorMessage: session.errorMessage,
    rawErrorMessage: session.rawErrorMessage,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    updatedAt: session.updatedAt,
  };
}

function parseIsoMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAiSummaryTaskActive(
  task: ArticleTaskRow | undefined,
  nowMs: number,
): boolean {
  if (!task) return true;
  if (task.status !== 'queued' && task.status !== 'running') return false;

  const referenceMs =
    parseIsoMs(task.startedAt) ??
    parseIsoMs(task.requestedAt) ??
    parseIsoMs(task.updatedAt) ??
    parseIsoMs(task.createdAt);
  if (referenceMs === null) return true;

  return nowMs - referenceMs <= SUMMARY_TASK_STALE_MS;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const articleId = paramsParsed.data.id;
    const pool = getPool();
    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));
    const usableFulltextHtml = getUsableFulltextHtml(article);

    const session = await getActiveAiSummarySessionByArticleId(pool, articleId);
    return ok({ session: buildSessionSnapshot(session) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const articleId = paramsParsed.data.id;
    const pool = getPool();
    const bodyParsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const force = bodyParsed.success ? Boolean(bodyParsed.data.force) : false;

    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));
    const usableFulltextHtml = getUsableFulltextHtml(article);

    const [aiApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool),
      getUiSettings(pool),
    ]);
    if (!aiApiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }

    const sharedAiConfig = resolveSharedAiConfig({
      settings: normalizePersistedSettings(uiSettings),
      aiApiKey,
    });
    if (!isAiRuntimeConfigComplete(sharedAiConfig)) {
      return ok({ enqueued: false, reason: 'missing_ai_config' });
    }
    const { shared: sharedConfigFingerprint } = resolveAiConfigFingerprints({
      settings: uiSettings,
      aiApiKey,
      translationApiKey: '',
    });

    const existingSession = await getActiveAiSummarySessionByArticleId(pool, articleId);
    let staleExistingSessionIdToSupersede: string | null = null;
    if (existingSession?.status === 'queued' || existingSession?.status === 'running') {
      const nowMs = Date.now();
      const taskRows = await getArticleTasksByArticleId(pool, articleId);
      const aiSummaryTask = taskRows.find((task) => task.type === 'ai_summary');
      if (isAiSummaryTaskActive(aiSummaryTask, nowMs)) {
        return ok({
          enqueued: false,
          reason: 'already_enqueued',
          sessionId: existingSession.id,
        });
      }

      // Stale running/queued session should not keep hijacking future snapshots.
      staleExistingSessionIdToSupersede = existingSession.id;
    }

    if (!force && article.aiSummary && article.aiSummary.trim()) {
      return ok({ enqueued: false, reason: 'already_summarized' });
    }

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
    if (isFulltextPending(article, fullTextOnOpenEnabled)) {
      return ok({ enqueued: false, reason: 'fulltext_pending' });
    }

    const sourceText = pickSummarySourceText({
      contentFullHtml: usableFulltextHtml,
      contentHtml: article.contentHtml,
      summary: article.summary,
    });
    const sourceTextHash = sha256(sourceText);

    const session = await upsertAiSummarySession(pool, {
      articleId,
      sourceTextHash,
      status: 'queued',
      draftText: '',
      finalText: null,
      model: null,
      jobId: null,
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
      supersededBySessionId: null,
    });

    if (
      existingSession &&
      existingSession.id !== session.id &&
      (force || staleExistingSessionIdToSupersede === existingSession.id)
    ) {
      await markAiSummarySessionSuperseded(pool, {
        sessionId: existingSession.id,
        supersededBySessionId: session.id,
      });
    }

    const enqueueResult = await enqueueWithResult(
      JOB_AI_SUMMARIZE,
      { articleId, sessionId: session.id, sharedConfigFingerprint },
      getQueueSendOptions(JOB_AI_SUMMARIZE, { articleId }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued', sessionId: session.id });
    }

    await upsertAiSummarySession(pool, {
      sessionId: session.id,
      articleId,
      sourceTextHash,
      status: 'queued',
      draftText: session.draftText,
      finalText: session.finalText,
      model: session.model,
      jobId: enqueueResult.jobId,
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
      supersededBySessionId: null,
    });

    await upsertTaskQueued(pool, {
      articleId,
      type: 'ai_summary',
      jobId: enqueueResult.jobId,
    });

    await writeUserOperationStartedLog(pool, {
      actionKey: 'article.aiSummary.generate',
      source: 'app/api/articles/[id]/ai-summary',
      context: {
        articleId,
        sessionId: session.id,
        jobId: enqueueResult.jobId,
      },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId, sessionId: session.id });
  } catch (err) {
    return fail(err);
  }
}
