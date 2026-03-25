import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../server/http/errors';
import { numericIdSchema } from '../../../../server/http/idSchemas';
import { getAiDigestConfigByFeedId } from '../../../../server/repositories/aiDigestRepo';
import { updateAiDigestWithCategoryResolution } from '../../../../server/services/aiDigestLifecycleService';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  feedId: numericIdSchema,
});

const categoryInputShape = {
  categoryId: numericIdSchema.nullable().optional(),
  categoryName: z.string().trim().min(1).nullable().optional(),
};

const INTERVAL_OPTIONS_MINUTES = [60, 120, 240, 480, 1440] as const;

const patchBodySchema = z
  .strictObject({
    title: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    intervalMinutes: z.number().int(),
    selectedFeedIds: z.array(numericIdSchema).min(1),
    ...categoryInputShape,
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    path: ['categoryName'],
    message: 'categoryId and categoryName are mutually exclusive',
  })
  .refine((value) => INTERVAL_OPTIONS_MINUTES.includes(value.intervalMinutes as never), {
    path: ['intervalMinutes'],
    message: 'intervalMinutes is not in allowed options',
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

const patchOperationSource = 'app/api/ai-digests/[feedId]';

async function writeAiDigestUpdateFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'aiDigest.update',
    source: patchOperationSource,
    err,
    context,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ feedId: string }> },
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
    const config = await getAiDigestConfigByFeedId(pool, paramsParsed.data.feedId);
    if (!config) {
      return fail(new NotFoundError('AI digest config not found'));
    }

    return ok({
      feedId: config.feedId,
      prompt: config.prompt,
      intervalMinutes: config.intervalMinutes,
      selectedFeedIds: config.selectedFeedIds,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ feedId: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeAiDigestUpdateFailure(error);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    if (json && typeof json === 'object' && 'selectedCategoryIds' in (json as Record<string, unknown>)) {
      const error = new ValidationError('Invalid request body', {
        selectedCategoryIds: 'selectedCategoryIds is not allowed',
      });
      await writeAiDigestUpdateFailure(error, { feedId: paramsParsed.data.feedId });
      return fail(error);
    }

    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeAiDigestUpdateFailure(error, { feedId: paramsParsed.data.feedId });
      return fail(error);
    }

    const pool = getPool();
    const updated = await updateAiDigestWithCategoryResolution(pool, {
      feedId: paramsParsed.data.feedId,
      ...parsed.data,
    });
    if (!updated) {
      const error = new NotFoundError('AI digest feed not found');
      await writeAiDigestUpdateFailure(error, { feedId: paramsParsed.data.feedId });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'aiDigest.update',
      source: patchOperationSource,
      context: { feedId: updated.id },
    });

    return ok(updated);
  } catch (err) {
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      const error = new ValidationError('Invalid request body', { categoryId: 'not_found' });
      await writeAiDigestUpdateFailure(error);
      return fail(error);
    }
    await writeAiDigestUpdateFailure(err);
    return fail(err);
  }
}
