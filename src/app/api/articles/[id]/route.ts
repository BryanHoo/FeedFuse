import { z } from 'zod';
import { evaluateArticleBodyTranslationEligibility } from '../../../../server/ai/articleTranslationEligibility';
import { getPool } from '../../../../server/db/pool';
import { getServerEnv } from '../../../../server/env';
import { ok, fail } from '../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../server/http/errors';
import { numericIdSchema } from '../../../../server/http/idSchemas';
import { getActiveAiSummarySessionByArticleId } from '../../../../server/repositories/articleAiSummaryRepo';
import {
  getArticleById,
  setArticleRead,
  setArticleStarred,
  type ArticleRow,
} from '../../../../server/repositories/articlesRepo';
import { listAiDigestRunSourcesByArticleId } from '../../../../server/repositories/aiDigestRepo';
import {
  buildImageProxyUrl,
  getOptionalImageProxySecret,
} from '../../../../server/media/imageProxyUrl';
import { rewriteHtmlImages } from '../../../../server/media/rewriteHtmlImages';
import { getUsableFulltextHtml } from '../../../../server/fulltext/fulltextVerification';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

const patchBodySchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function htmlContainsImage(html: string | null | undefined): html is string {
  return typeof html === 'string' && /<img\b/i.test(html);
}

function rewriteArticleHtmlFields(article: ArticleRow): ArticleRow {
  const hasImages = [
    article.contentHtml,
    article.contentFullHtml,
    article.aiTranslationBilingualHtml,
    article.aiTranslationZhHtml,
  ].some(htmlContainsImage);

  if (!hasImages) {
    return article;
  }

  const secret = getOptionalImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (!secret) {
    return article;
  }

  const rewriteUrl = (sourceUrl: string) => buildImageProxyUrl({ sourceUrl, secret });

  return {
    ...article,
    contentHtml: htmlContainsImage(article.contentHtml)
      ? rewriteHtmlImages(article.contentHtml, rewriteUrl)
      : article.contentHtml,
    contentFullHtml: htmlContainsImage(article.contentFullHtml)
      ? rewriteHtmlImages(article.contentFullHtml, rewriteUrl)
      : article.contentFullHtml,
    aiTranslationBilingualHtml: htmlContainsImage(article.aiTranslationBilingualHtml)
      ? rewriteHtmlImages(article.aiTranslationBilingualHtml, rewriteUrl)
      : article.aiTranslationBilingualHtml,
    aiTranslationZhHtml: htmlContainsImage(article.aiTranslationZhHtml)
      ? rewriteHtmlImages(article.aiTranslationZhHtml, rewriteUrl)
      : article.aiTranslationZhHtml,
  };
}

function buildAiSummarySessionSnapshot(
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

function resolvePatchOperation(input: {
  articleId: string;
  isRead?: boolean;
  isStarred?: boolean;
}):
  | {
      actionKey: 'article.markRead' | 'article.toggleStar';
      context: Record<string, unknown>;
    }
  | null {
  if (typeof input.isRead !== 'undefined' && typeof input.isStarred === 'undefined') {
    return {
      actionKey: 'article.markRead',
      context: { articleId: input.articleId },
    };
  }

  if (typeof input.isStarred !== 'undefined' && typeof input.isRead === 'undefined') {
    return {
      actionKey: 'article.toggleStar',
      context: {
        articleId: input.articleId,
        starred: input.isStarred,
      },
    };
  }

  return null;
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

    const pool = getPool();
    const article = await getArticleById(pool, paramsParsed.data.id);
    if (!article) return fail(new NotFoundError('Article not found'));

    const usableFulltextHtml = getUsableFulltextHtml(article);
    const articleWithUsableFulltext =
      usableFulltextHtml === article.contentFullHtml
        ? article
        : { ...article, contentFullHtml: usableFulltextHtml };
    const proxiedArticle = rewriteArticleHtmlFields(articleWithUsableFulltext);
    const aiSummarySession = await getActiveAiSummarySessionByArticleId(pool, article.id);
    const aiDigestSources = await listAiDigestRunSourcesByArticleId(pool, article.id);
    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: usableFulltextHtml,
      summary: article.summary,
    });

    return ok({
      ...proxiedArticle,
      aiSummarySession: buildAiSummarySessionSnapshot(aiSummarySession),
      aiDigestSources,
      bodyTranslationEligible: eligibility.bodyTranslationEligible,
      bodyTranslationBlockedReason: eligibility.bodyTranslationBlockedReason,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let operation:
    | {
        actionKey: 'article.markRead' | 'article.toggleStar';
        context: Record<string, unknown>;
      }
    | null = null;

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error)));
    }

    const pool = getPool();
    const { isRead, isStarred } = bodyParsed.data;
    operation = resolvePatchOperation({
      articleId: paramsParsed.data.id,
      isRead,
      isStarred,
    });

    if (typeof isRead !== 'undefined') {
      await setArticleRead(pool, paramsParsed.data.id, isRead);
    }
    if (typeof isStarred !== 'undefined') {
      await setArticleStarred(pool, paramsParsed.data.id, isStarred);
    }

    if (operation) {
      await writeUserOperationSucceededLog(pool, {
        actionKey: operation.actionKey,
        source: 'app/api/articles/[id]',
        context: operation.context,
      });
    }

    return ok({ updated: true });
  } catch (err) {
    if (operation) {
      await writeUserOperationFailedLog(getPool(), {
        actionKey: operation.actionKey,
        source: 'app/api/articles/[id]',
        err,
        context: operation.context,
      });
    }
    return fail(err);
  }
}
