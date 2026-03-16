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
  pool: { query: (...args: unknown[]) => unknown };
  boss: {
    send: (
      name: string,
      data?: object | null,
      // pg-boss send options shape differs between builds; keep it permissive.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      options?: any,
    ) => unknown;
  };
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
    if (existing) {
      continue;
    }

    const created = await createAiDigestRun(deps.pool as never, {
      feedId,
      windowStartAt,
      windowEndAt,
      status: 'queued',
    });

    if (!created) continue;

    const jobIdRaw = await deps.boss.send(
      JOB_AI_DIGEST_GENERATE,
      { runId: created.id },
      getQueueSendOptions(JOB_AI_DIGEST_GENERATE, { runId: created.id }),
    );

    const jobId =
      typeof jobIdRaw === 'string' || typeof jobIdRaw === 'number' ? String(jobIdRaw) : null;

    if (jobId && jobId.trim()) {
      await updateAiDigestRun(deps.pool as never, created.id, { jobId: jobId.trim() });
    }
  }
}
