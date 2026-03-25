import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import { optionalNumericIdSchema } from '../../../../server/http/idSchemas';
import { markAllRead } from '../../../../server/repositories/articlesRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  feedId: optionalNumericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeUserOperationFailedLog(getPool(), {
        actionKey: 'article.markAllRead',
        source: 'app/api/articles/mark-all-read',
        err: error,
      });
      return fail(error);
    }

    const pool = getPool();
    const updatedCount = await markAllRead(pool, { feedId: parsed.data.feedId });
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'article.markAllRead',
      source: 'app/api/articles/mark-all-read',
      context: { feedId: parsed.data.feedId, updatedCount },
    });
    return ok({ updatedCount });
  } catch (err) {
    await writeUserOperationFailedLog(getPool(), {
      actionKey: 'article.markAllRead',
      source: 'app/api/articles/mark-all-read',
      err,
    });
    return fail(err);
  }
}
