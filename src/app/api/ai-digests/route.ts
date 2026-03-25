import { z } from 'zod';
import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { ValidationError } from '../../../server/http/errors';
import { numericIdSchema } from '../../../server/http/idSchemas';
import { createAiDigestWithCategoryResolution } from '../../../server/services/aiDigestLifecycleService';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const categoryInputShape = {
  categoryId: numericIdSchema.nullable().optional(),
  categoryName: z.string().trim().min(1).nullable().optional(),
};

const INTERVAL_OPTIONS_MINUTES = [60, 120, 240, 480, 1440] as const;

const bodySchema = z
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

const operationSource = 'app/api/ai-digests';

async function writeAiDigestCreateFailure(err: unknown) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'aiDigest.create',
    source: operationSource,
    err,
  });
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    if (json && typeof json === 'object' && 'selectedCategoryIds' in (json as Record<string, unknown>)) {
      const error = new ValidationError('Invalid request body', {
        selectedCategoryIds: 'selectedCategoryIds is not allowed',
      });
      await writeAiDigestCreateFailure(error);
      return fail(error);
    }

    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeAiDigestCreateFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const created = await createAiDigestWithCategoryResolution(pool, parsed.data);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'aiDigest.create',
      source: operationSource,
      context: { feedId: created.id },
    });
    return ok({ ...created, unreadCount: 0 });
  } catch (err) {
    await writeAiDigestCreateFailure(err);
    return fail(err);
  }
}
