import { requireApiSession } from '@/server/auth/session';
import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { fail, ok } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getAiDigestRunById } from '../../../../../server/repositories/aiDigestRepo';
import { getPrivateFmEpisodeByRunId } from '../../../../../server/repositories/privateFmRepo';

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
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }

    const pool = getPool();
    const run = await getAiDigestRunById(pool, parsed.data.runId);
    if (!run) {
      return fail(new NotFoundError('AI digest run not found'));
    }
    const privateFmEpisode = run.privateFmEnabled
      ? await getPrivateFmEpisodeByRunId(pool, run.id)
      : null;

    return ok({
      id: run.id,
      status: run.status,
      candidateTotal: run.candidateTotal,
      selectedCount: run.selectedCount,
      articleId: run.articleId,
      privateFmEnabled: run.privateFmEnabled,
      privateFmEpisode: privateFmEpisode
          ? {
            id: privateFmEpisode.id,
            status: privateFmEpisode.status,
            hasScript: Boolean(privateFmEpisode.scriptText?.trim()),
            errorCode: privateFmEpisode.errorCode,
            errorMessage: privateFmEpisode.errorMessage,
            updatedAt: privateFmEpisode.updatedAt,
          }
        : null,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      updatedAt: run.updatedAt,
    });
  } catch (err) {
    return fail(err);
  }
}
