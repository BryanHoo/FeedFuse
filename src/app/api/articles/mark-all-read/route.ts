import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { optionalNumericIdSchema } from '@/server/infra/http/idSchemas';
import { startFeverBatchRead } from '@/server/domains/fever/services/feverBatchReadService';
import { listBatchReadTasks } from '@/server/domains/fever/repositories/feverBatchReadRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationStartedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

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
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeUserOperationFailedLog(getPool(), {
        userId: session.userId,
        actionKey: 'article.markAllRead',
        source: 'app/api/articles/mark-all-read',
        err: error,
      });
      return fail(error);
    }

    const pool = getPool();
    const result = await startFeverBatchRead(pool, {
      feedId: parsed.data.feedId,
      userId: session.userId,
    });
    await (result.task ? writeUserOperationStartedLog : writeUserOperationSucceededLog)(pool, {
      userId: session.userId,
      actionKey: 'article.markAllRead',
      source: 'app/api/articles/mark-all-read',
      context: { feedId: parsed.data.feedId, updatedCount: result.updatedCount, runId: result.task?.id },
    });
    return ok(result, { status: result.task ? 202 : 200 });
  } catch (err) {
    await writeUserOperationFailedLog(getPool(), {
      userId: session.userId,
      actionKey: 'article.markAllRead',
      source: 'app/api/articles/mark-all-read',
      err,
    });
    return fail(err);
  }
}


export async function GET() {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  try {
    const tasks = await listBatchReadTasks(getPool(), session.userId);
    return ok({ tasks }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return fail(error);
  }
}
