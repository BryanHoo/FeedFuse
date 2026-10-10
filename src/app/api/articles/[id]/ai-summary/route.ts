import { requireApiSession } from '@/server/domains/auth/services/session';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizePersistedSettings } from '../../../../../features/settings/settingsSchema';
import {
  isAiRuntimeConfigComplete,
  resolveSharedAiConfig,
} from '@/server/integrations/ai/runtimeConfig';
import { resolveAiConfigFingerprints } from '@/server/integrations/ai/configFingerprints';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  getArticleById,
  listArticleMediaAttachments,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  getActiveAiSummarySessionByArticleId,
} from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import { enqueueAiSummarySession } from '@/server/domains/articles/services/aiSummarySessionService';
import { getFeedFullTextOnOpenEnabled } from '@/server/domains/feeds/repositories/feedsRepo';
import { getAiApiKey, getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import {
  getUsableFulltextHtml,
  isFulltextPending,
} from '@/server/integrations/fulltext/fulltextVerification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authSession = await requireApiSession();
  if (authSession && 'response' in authSession) {
    return authSession.response;
  }

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
    const article = await getArticleById(pool, articleId, authSession.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const summarySession = await getActiveAiSummarySessionByArticleId(
      pool,
      articleId,
      authSession.userId,
    );
    return ok({ session: buildSessionSnapshot(summarySession) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authSession = await requireApiSession();
  if (authSession && 'response' in authSession) {
    return authSession.response;
  }

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

    const article = await getArticleById(pool, articleId, authSession.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    // 播客文章不进入 AI 摘要链路，避免对节目内容做文本化处理。
    const mediaAttachments = await listArticleMediaAttachments(pool, articleId, authSession.userId);
    if (mediaAttachments.length > 0) {
      return ok({ enqueued: false, reason: 'podcast_article' });
    }

    const usableFulltextHtml = getUsableFulltextHtml(article);

    const [aiApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool, authSession.userId),
      getUiSettings(pool, authSession.userId),
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

    if (!force && article.aiSummary && article.aiSummary.trim()) {
      return ok({ enqueued: false, reason: 'already_summarized' });
    }

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(
      pool,
      article.feedId,
      authSession.userId,
    );
    if (isFulltextPending(article, fullTextOnOpenEnabled)) {
      return ok({ enqueued: false, reason: 'fulltext_pending' });
    }

    const sourceText = pickSummarySourceText({
      contentFullHtml: usableFulltextHtml,
      contentHtml: article.contentHtml,
      summary: article.summary,
    });
    const sourceTextHash = sha256(sourceText);

    const result = await enqueueAiSummarySession({
      pool,
      userId: authSession.userId,
      articleId,
      sourceTextHash,
      sharedConfigFingerprint,
      force,
    });
    return ok(result);
  } catch (err) {
    return fail(err);
  }
}
