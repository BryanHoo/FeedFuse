import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { fail, ok } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getAiDigestRunById } from '../../../../../server/repositories/aiDigestRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  runId: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  try {
    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }

    const run = await getAiDigestRunById(getPool(), parsed.data.runId);
    if (!run) {
      return fail(new NotFoundError('AI digest run not found'));
    }

    return ok({
      id: run.id,
      status: run.status,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      updatedAt: run.updatedAt,
    });
  } catch (err) {
    return fail(err);
  }
}
