import { z } from 'zod';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { JOB_FEED_FETCH } from '../../../../../server/queue/jobs';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { getPool } from '../../../../../server/db/pool';
import { initializeFeedRefreshRun } from '../../../../../server/services/feedRefreshRunService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
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

    const run = await initializeFeedRefreshRun(getPool(), {
      scope: 'single',
      feedId: paramsParsed.data.id,
      targetFeedIds: [paramsParsed.data.id],
    });
    const payload = { feedId: paramsParsed.data.id, force: true, runId: run.id };
    const result = await enqueueWithResult(
      JOB_FEED_FETCH,
      payload,
      getQueueSendOptions(JOB_FEED_FETCH, payload),
    );
    if (result.status !== 'enqueued') return ok({ enqueued: false, runId: run.id });
    return ok({ enqueued: true, jobId: result.jobId, runId: run.id });
  } catch (err) {
    return fail(err);
  }
}
