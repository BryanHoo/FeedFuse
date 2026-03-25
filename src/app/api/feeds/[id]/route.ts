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
import { normalizeFeedAutoTriggerFlags } from '../../../../lib/feedAutoTriggerPolicy';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const feedUrlSafetyOptions = { allowUnresolvedHostname: true } as const;

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

const patchOperationSource = 'app/api/feeds/[id]';
const deleteOperationSource = 'app/api/feeds/[id]';

function resolveFeedPatchActionKey(input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (keys.length === 1 && keys[0] === 'enabled' && typeof input.enabled === 'boolean') {
    return input.enabled ? 'feed.enable' : 'feed.disable';
  }
  if (
    keys.length > 0 &&
    keys.every((key) => key === 'categoryId' || key === 'categoryName')
  ) {
    return 'feed.moveToCategory';
  }
  if (keys.length === 1 && keys[0] === 'articleListDisplayMode') {
    return 'feed.articleListDisplayMode.update';
  }
  return 'feed.update';
}

async function writeFeedPatchFailure(
  actionKey: ReturnType<typeof resolveFeedPatchActionKey>,
  err: unknown,
  context?: Record<string, unknown>,
) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey,
    source: patchOperationSource,
    err,
    context,
  });
}

async function writeFeedDeleteFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'feed.delete',
    source: deleteOperationSource,
    err,
    context,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let actionKey: ReturnType<typeof resolveFeedPatchActionKey> = 'feed.update';

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error));
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    actionKey = resolveFeedPatchActionKey(bodyParsed.data);
    if (
      typeof bodyParsed.data.url !== 'undefined' &&
      !(await isSafeExternalUrl(bodyParsed.data.url, feedUrlSafetyOptions))
    ) {
      const error = new ValidationError('Invalid request body', { url: 'Unsafe URL' });
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }

    const input = normalizeFeedAutoTriggerFlags({
      ...bodyParsed.data,
      ...(typeof bodyParsed.data.siteUrl !== 'undefined'
        ? { iconUrl: deriveFeedIconUrl(bodyParsed.data.siteUrl) }
        : {}),
    });

    const pool = getPool();
    const updated = await updateFeedWithCategoryResolution(pool, paramsParsed.data.id, input);
    if (!updated) {
      const error = new NotFoundError('Feed not found');
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey,
      source: patchOperationSource,
      context: { feedId: updated.id },
    });
    return ok(updated);
  } catch (err) {
    if (isUniqueViolation(err, 'feeds_url_unique')) {
      const error = new ConflictError('Feed already exists', { url: 'duplicate' });
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      const error = new ValidationError('Invalid request body', { categoryId: 'not_found' });
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }
    await writeFeedPatchFailure(actionKey, err);
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
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeFeedDeleteFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const deleted = await deleteFeedAndCleanupCategory(pool, paramsParsed.data.id);
    if (!deleted) {
      const error = new NotFoundError('Feed not found');
      await writeFeedDeleteFailure(error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'feed.delete',
      source: deleteOperationSource,
      context: { feedId: paramsParsed.data.id },
    });

    return ok({ deleted: true });
  } catch (err) {
    await writeFeedDeleteFailure(err);
    return fail(err);
  }
}
