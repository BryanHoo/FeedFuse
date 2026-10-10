import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { ValidationError } from '@/server/infra/http/errors';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { retryFeverBatchRead } from '@/server/domains/fever/services/feverBatchReadService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if ('response' in session) return session.response;
  try {
    const { id } = await context.params;
    if (!numericIdSchema.safeParse(id).success) throw new ValidationError('Invalid task id', { id: 'Invalid numeric id' });
    const task = await retryFeverBatchRead(getPool(), { runId: id, userId: session.userId });
    return ok({ task }, { status: 202 });
  } catch (error) {
    return fail(error);
  }
}
