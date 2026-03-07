import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { normalizePersistedSettings } from '../../../../../features/settings/settingsSchema';
import { evaluateArticleBodyTranslationEligibility } from '../../../../../server/ai/articleTranslationEligibility';
import { resolveTranslationConfig } from '../../../../../server/ai/translationConfig';
import { extractImmersiveSegments, hashSourceHtml } from '../../../../../server/ai/immersiveTranslationSession';
import { getArticleById, type ArticleRow } from '../../../../../server/repositories/articlesRepo';
import {
  deleteTranslationEventsBySessionId,
  deleteTranslationSegmentsBySessionId,
  getTranslationSessionByArticleId,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
  upsertTranslationSession,
} from '../../../../../server/repositories/articleTranslationRepo';
import {
  getArticleTasksByArticleId,
  type ArticleTaskRow,
  upsertTaskQueued,
} from '../../../../../server/repositories/articleTasksRepo';
import {
  getFeedBodyTranslateEnabled,
  getFeedFullTextOnOpenEnabled,
} from '../../../../../server/repositories/feedsRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
} from '../../../../../server/repositories/settingsRepo';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { JOB_AI_TRANSLATE } from '../../../../../server/queue/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});
const bodySchema = z.object({
  force: z.boolean().optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function getArticleHtmlSource(article: ArticleRow): string {
  return article.contentFullHtml ?? article.contentHtml ?? '';
}

function buildSessionSnapshot(
  session: Awaited<ReturnType<typeof getTranslationSessionByArticleId>>,
) {
  if (!session) return null;
  return {
    id: session.id,
    articleId: session.articleId,
    sourceHtmlHash: session.sourceHtmlHash,
    status: session.status,
    totalSegments: session.totalSegments,
    translatedSegments: session.translatedSegments,
    failedSegments: session.failedSegments,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    updatedAt: session.updatedAt,
  };
}

function isAiTranslateTaskActive(task: ArticleTaskRow | undefined): boolean {
  if (!task) return true;
  return task.status === 'queued' || task.status === 'running';
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

    const session = await getTranslationSessionByArticleId(pool, articleId);
    if (!session) {
      return ok({ session: null, segments: [] });
    }

    const segments = await listTranslationSegmentsBySessionId(pool, session.id);
    return ok({
      session: buildSessionSnapshot(session),
      segments: segments.map((segment) => ({
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        sourceText: segment.sourceText,
        translatedText: segment.translatedText,
        status: segment.status,
        errorCode: segment.errorCode,
        errorMessage: segment.errorMessage,
        updatedAt: segment.updatedAt,
      })),
    });
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

    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: article.contentFullHtml,
      summary: article.summary,
    });
    if (!eligibility.bodyTranslationEligible) {
      return ok({ enqueued: false, reason: 'source_is_simplified_chinese' });
    }

    const [aiApiKey, translationApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool),
      getTranslationApiKey(pool),
      getUiSettings(pool),
    ]);
    const normalizedSettings = normalizePersistedSettings(uiSettings);
    const translationConfig = resolveTranslationConfig({
      settings: normalizedSettings,
      aiApiKey,
      translationApiKey,
    });

    if (!translationConfig.apiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }

    const feedBodyTranslateEnabled = await getFeedBodyTranslateEnabled(pool, article.feedId);
    if (!force && feedBodyTranslateEnabled !== true) {
      return ok({ enqueued: false, reason: 'body_translate_disabled' });
    }

    if (
      !force &&
      (article.aiTranslationBilingualHtml?.trim() || article.aiTranslationZhHtml?.trim())
    ) {
      return ok({ enqueued: false, reason: 'already_translated' });
    }

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
    if (
      fullTextOnOpenEnabled === true &&
      !article.contentFullHtml &&
      !article.contentFullError
    ) {
      return ok({ enqueued: false, reason: 'fulltext_pending' });
    }

    const sourceHtml = getArticleHtmlSource(article);
    const sourceHtmlHash = hashSourceHtml(sourceHtml);
    const existingSession = await getTranslationSessionByArticleId(pool, articleId);

    if (
      existingSession &&
      existingSession.status === 'running' &&
      existingSession.sourceHtmlHash === sourceHtmlHash
    ) {
      const taskRows = await getArticleTasksByArticleId(pool, articleId);
      const aiTranslateTask = taskRows.find((task) => task.type === 'ai_translate');
      if (isAiTranslateTaskActive(aiTranslateTask)) {
        return ok({
          enqueued: false,
          reason: 'already_enqueued',
          sessionId: existingSession.id,
        });
      }
    }

    const segments = extractImmersiveSegments(sourceHtml);
    if (existingSession) {
      await deleteTranslationSegmentsBySessionId(pool, existingSession.id);
      await deleteTranslationEventsBySessionId(pool, existingSession.id);
    }

    const session = await upsertTranslationSession(pool, {
      articleId,
      sourceHtmlHash,
      status: 'running',
      totalSegments: segments.length,
      translatedSegments: 0,
      failedSegments: 0,
    });

    for (const segment of segments) {
      await upsertTranslationSegment(pool, {
        sessionId: session.id,
        segmentIndex: segment.segmentIndex,
        sourceText: segment.text,
        translatedText: null,
        status: 'pending',
        errorCode: null,
        errorMessage: null,
      });
    }

    const enqueueResult = await enqueueWithResult(
      JOB_AI_TRANSLATE,
      { articleId },
      getQueueSendOptions(JOB_AI_TRANSLATE, { articleId, force }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued' });
    }

    await upsertTaskQueued(pool, {
      articleId,
      type: 'ai_translate',
      jobId: enqueueResult.jobId,
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId, sessionId: session.id });
  } catch (err) {
    return fail(err);
  }
}
