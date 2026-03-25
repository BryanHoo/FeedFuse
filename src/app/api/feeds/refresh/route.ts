import { ok, fail } from '../../../../server/http/apiResponse';
import { getQueueSendOptions } from '../../../../server/queue/contracts';
import { JOB_REFRESH_ALL } from '../../../../server/queue/jobs';
import { enqueueWithResult } from '../../../../server/queue/queue';
import { getPool } from '../../../../server/db/pool';
import { initializeFeedRefreshRun } from '../../../../server/services/feedRefreshRunService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const run = await initializeFeedRefreshRun(getPool(), {
      scope: 'all',
    });
    const payload = { force: true, runId: run.id };
    const result = await enqueueWithResult(
      JOB_REFRESH_ALL,
      payload,
      getQueueSendOptions(JOB_REFRESH_ALL, payload),
    );
    if (result.status !== 'enqueued') return ok({ enqueued: false, runId: run.id });
    return ok({ enqueued: true, jobId: result.jobId, runId: run.id });
  } catch (err) {
    return fail(err);
  }
}
