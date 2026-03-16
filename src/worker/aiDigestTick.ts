import { getAiApiKey } from '../server/repositories/settingsRepo';
import {
  createAiDigestRun,
  getAiDigestConfigByFeedId,
  getAiDigestRunByFeedIdAndWindowStartAt,
  listDueAiDigestConfigFeedIds,
  updateAiDigestRun,
} from '../server/repositories/aiDigestRepo';
import { getQueueSendOptions } from '../server/queue/contracts';
import { JOB_AI_DIGEST_GENERATE } from '../server/queue/jobs';

export async function runAiDigestTick(deps: {
  pool: { query: Function };
  boss: { send: Function };
  now?: Date;
}) {
  const now = deps.now ?? new Date();

  const aiApiKey = await getAiApiKey(deps.pool as never);
  if (!aiApiKey.trim()) {
    return;
  }

  const dueFeedIds = await listDueAiDigestConfigFeedIds(deps.pool as never, { now });

  for (const feedId of dueFeedIds) {
    const config = await getAiDigestConfigByFeedId(deps.pool as never, feedId);
    if (!config) continue;

    const windowStartAt = config.lastWindowEndAt;
    const windowEndAt = now.toISOString();

    const existing = await getAiDigestRunByFeedIdAndWindowStartAt(deps.pool as never, {
      feedId,
      windowStartAt,
    });
    if (existing && (existing.status === 'queued' || existing.status === 'running' || existing.status === 'failed')) {
      continue;
    }

    const created = await createAiDigestRun(deps.pool as never, {
      feedId,
      windowStartAt,
      windowEndAt,
      status: 'queued',
    });

    const run =
      created ??
      (await getAiDigestRunByFeedIdAndWindowStartAt(deps.pool as never, {
        feedId,
        windowStartAt,
      }));
    if (!run) continue;
    if (run.status === 'queued' || run.status === 'running') continue;
    if (run.status === 'failed') continue;

    const jobId = await deps.boss.send(
      JOB_AI_DIGEST_GENERATE,
      { runId: run.id },
      getQueueSendOptions(JOB_AI_DIGEST_GENERATE, { runId: run.id }),
    );

    if (typeof jobId === 'string' && jobId.trim()) {
      await updateAiDigestRun(deps.pool as never, run.id, { jobId: jobId.trim() });
    }
  }
}

