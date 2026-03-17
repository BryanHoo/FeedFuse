import { z } from 'zod';
import { evaluateArticleBodyTranslationEligibility } from '../../../../server/ai/articleTranslationEligibility';
import { getPool } from '../../../../server/db/pool';
import { getServerEnv } from '../../../../server/env';
import { ok, fail } from '../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../server/http/errors';
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ARTICLE_CONTENT_IMAGE_QUALITY = 70;

const paramsSchema = z.object({
  id: z.string().uuid(),
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

  const rewriteUrl = (sourceUrl: string) =>
    buildImageProxyUrl({ sourceUrl, secret, quality: ARTICLE_CONTENT_IMAGE_QUALITY });

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
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    updatedAt: session.updatedAt,
  };
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

    const proxiedArticle = rewriteArticleHtmlFields(article);
    const aiSummarySession = await getActiveAiSummarySessionByArticleId(pool, article.id);
    const aiDigestSources = await listAiDigestRunSourcesByArticleId(pool, article.id);
    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: article.contentFullHtml,
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

    if (typeof isRead !== 'undefined') {
      await setArticleRead(pool, paramsParsed.data.id, isRead);
    }
    if (typeof isStarred !== 'undefined') {
      await setArticleStarred(pool, paramsParsed.data.id, isStarred);
    }

    return ok({ updated: true });
  } catch (err) {
    return fail(err);
  }
}
