import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../server/http/errors';
import { deleteFeed, updateFeed } from '../../../../server/repositories/feedsRepo';
import { deriveFeedIconUrl } from '../../../../server/rss/deriveFeedIconUrl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).url().optional(),
    siteUrl: z.string().trim().url().nullable().optional(),
    enabled: z.boolean().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    fullTextOnOpenEnabled: z.boolean().optional(),
    aiSummaryOnOpenEnabled: z.boolean().optional(),
    titleTranslateEnabled: z.boolean().optional(),
    bodyTranslateEnabled: z.boolean().optional(),
    articleListDisplayMode: z.enum(['card', 'list']).optional(),
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

    const input = {
      ...bodyParsed.data,
      ...(typeof bodyParsed.data.siteUrl !== 'undefined'
        ? { iconUrl: deriveFeedIconUrl(bodyParsed.data.siteUrl) }
        : {}),
    };

    const pool = getPool();
    const updated = await updateFeed(pool, paramsParsed.data.id, input);
    if (!updated) return fail(new NotFoundError('Feed not found'));
    return ok(updated);
  } catch (err) {
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
    const deleted = await deleteFeed(pool, paramsParsed.data.id);
    if (!deleted) return fail(new NotFoundError('Feed not found'));
    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
