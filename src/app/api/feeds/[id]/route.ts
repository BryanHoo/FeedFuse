import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { numericIdSchema } from '../../../../server/http/idSchemas';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../server/http/errors';
import { deriveFeedIconUrl } from '../../../../server/rss/deriveFeedIconUrl';
import { isSafeExternalUrl } from '../../../../server/rss/ssrfGuard';
import {
  deleteFeedAndCleanupCategory,
  updateFeedWithCategoryResolution,
} from '../../../../server/services/feedCategoryLifecycleService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

const categoryInputShape = {
  categoryId: numericIdSchema.nullable().optional(),
  categoryName: z.string().trim().min(1).nullable().optional(),
};

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).url().optional(),
    siteUrl: z.string().trim().url().nullable().optional(),
    enabled: z.boolean().optional(),
    ...categoryInputShape,
    fullTextOnOpenEnabled: z.boolean().optional(),
    fullTextOnFetchEnabled: z.boolean().optional(),
    aiSummaryOnOpenEnabled: z.boolean().optional(),
    aiSummaryOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnOpenEnabled: z.boolean().optional(),
    titleTranslateEnabled: z.boolean().optional(),
    bodyTranslateEnabled: z.boolean().optional(),
    articleListDisplayMode: z.enum(['card', 'list']).optional(),
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    path: ['categoryName'],
    message: 'categoryId and categoryName are mutually exclusive',
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

function isForeignKeyViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23503' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

function isUniqueViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
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
    if (
      typeof bodyParsed.data.url !== 'undefined' &&
      !(await isSafeExternalUrl(bodyParsed.data.url))
    ) {
      return fail(new ValidationError('Invalid request body', { url: 'Unsafe URL' }));
    }

    const input = {
      ...bodyParsed.data,
      ...(typeof bodyParsed.data.siteUrl !== 'undefined'
        ? { iconUrl: deriveFeedIconUrl(bodyParsed.data.siteUrl) }
        : {}),
    };

    const pool = getPool();
    const updated = await updateFeedWithCategoryResolution(pool, paramsParsed.data.id, input);
    if (!updated) return fail(new NotFoundError('Feed not found'));
    return ok(updated);
  } catch (err) {
    if (isUniqueViolation(err, 'feeds_url_unique')) {
      return fail(new ConflictError('Feed already exists', { url: 'duplicate' }));
    }
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      return fail(new ValidationError('Invalid request body', { categoryId: 'not_found' }));
    }
    return fail(err);
  }
}

export async function DELETE(
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
    const deleted = await deleteFeedAndCleanupCategory(pool, paramsParsed.data.id);
    if (!deleted) return fail(new NotFoundError('Feed not found'));

    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
