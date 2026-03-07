import { z } from 'zod';
import { evaluateArticleBodyTranslationEligibility } from '../../../../server/ai/articleTranslationEligibility';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../server/http/errors';
import {
  getArticleById,
  setArticleRead,
  setArticleStarred,
} from '../../../../server/repositories/articlesRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: article.contentFullHtml,
      summary: article.summary,
    });

    return ok({
      ...article,
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
