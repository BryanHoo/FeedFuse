import type { Pool } from 'pg';
import {
  createFeedRefreshRun,
  getFeedRefreshRunById,
  listFeedRefreshRunItemsByRunId,
  lockFeedRefreshRunById,
  type FeedRefreshRunItemRow,
  type FeedRefreshRunRow,
  type FeedRefreshRunScope,
  type FeedRefreshRunStatus,
  upsertFeedRefreshRunItems,
  updateFeedRefreshRun,
} from '@/server/domains/feeds/repositories/feedRefreshRunRepo';
import { normalizeUserId } from '@/server/domains/users/userScope';

type AggregateInputItem = Pick<FeedRefreshRunItemRow, 'feedId' | 'status' | 'errorMessage'>;

export function buildFeedRefreshRunAggregate(input: {
  scope: FeedRefreshRunScope;
  items: AggregateInputItem[];
}): {
  status: FeedRefreshRunStatus;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  errorMessage: string | null;
} {
  const totalCount = input.items.length;
  const succeededCount = input.items.filter((item) => item.status === 'succeeded').length;
  const failedItems = input.items.filter((item) => item.status === 'failed');
  const failedCount = failedItems.length;
  const queuedCount = input.items.filter((item) => item.status === 'queued').length;
  const runningCount = input.items.filter((item) => item.status === 'running').length;

  if (totalCount === 0) {
    return {
      status: 'succeeded',
      totalCount,
      succeededCount,
      failedCount,
      errorMessage: null,
    };
  }

  if (runningCount > 0 || queuedCount > 0) {
    return {
      status: succeededCount === 0 && failedCount === 0 ? 'queued' : 'running',
      totalCount,
      succeededCount,
      failedCount,
      errorMessage: null,
    };
  }

  if (failedCount > 0) {
    return {
      status: 'failed',
      totalCount,
      succeededCount,
      failedCount,
      errorMessage:
        input.scope === 'all'
          ? `${failedCount} 个订阅源刷新失败`
          : failedItems[0]?.errorMessage?.trim() || '请稍后重试',
    };
  }

  return {
    status: 'succeeded',
    totalCount,
    succeededCount,
    failedCount,
    errorMessage: null,
  };
}

async function persistAggregate(
  pool: Pool,
  runId: string,
  userId?: string,
): Promise<FeedRefreshRunRow | null> {
  const scopedUserId = normalizeUserId(userId);
  const client = await pool.connect();
  try {
    await client.query('begin');

    // 先串行化同一 run 的汇总，再读取明细；仅开启事务仍可能让旧统计晚写入并覆盖终态。
    // READ COMMITTED 下，等待锁结束后的明细查询会取得新快照，纳入其他源已提交的结果。
    const run = await lockFeedRefreshRunById(client, runId, scopedUserId);
    if (!run) {
      await client.query('rollback');
      return null;
    }

    const items = await listFeedRefreshRunItemsByRunId(client as never, runId, scopedUserId);
    const aggregate = buildFeedRefreshRunAggregate({
      scope: run.scope,
      items,
    });
    const isTerminal = aggregate.status === 'succeeded' || aggregate.status === 'failed';
    const updated = await updateFeedRefreshRun(client as never, runId, {
      status: aggregate.status,
      totalCount: aggregate.totalCount,
      succeededCount: aggregate.succeededCount,
      failedCount: aggregate.failedCount,
      errorMessage: aggregate.errorMessage,
      finishedAt: isTerminal ? new Date().toISOString() : null,
      userId: scopedUserId,
    });

    await client.query('commit');
    return updated;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeFeedRefreshRun(
  pool: Pool,
  input: {
    scope: FeedRefreshRunScope;
    feedId?: string | null;
    targetFeedIds?: string[];
    userId?: string;
  },
): Promise<FeedRefreshRunRow> {
  const userId = normalizeUserId(input.userId);
  const targetFeedIds = input.targetFeedIds ?? [];
  const totalCount = targetFeedIds.length;
  const hasExplicitTargets = Array.isArray(input.targetFeedIds);
  const shouldStartSucceeded = hasExplicitTargets && totalCount === 0;
  const client = await pool.connect();

  try {
    await client.query('begin');

    const run = await createFeedRefreshRun(client as never, {
      scope: input.scope,
      status: shouldStartSucceeded ? 'succeeded' : 'queued',
      feedId: input.feedId ?? null,
      totalCount,
      errorMessage: null,
      finishedAt: shouldStartSucceeded ? new Date().toISOString() : null,
      userId,
    });

    if (totalCount > 0) {
      await upsertFeedRefreshRunItems(client as never, {
        runId: run.id,
        userId,
        items: targetFeedIds.map((feedId) => ({
          feedId,
          status: 'queued',
          errorMessage: null,
        })),
      });
    }

    await client.query('commit');
    return run;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function attachFeedRefreshRunItems(
  pool: Pool,
  input: { runId: string; targetFeedIds: string[]; userId?: string },
): Promise<FeedRefreshRunRow | null> {
  const userId = normalizeUserId(input.userId);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const run = await getFeedRefreshRunById(client as never, input.runId, userId);
    if (!run) {
      await client.query('rollback');
      return null;
    }

    await upsertFeedRefreshRunItems(client as never, {
      runId: input.runId,
      userId,
      items: input.targetFeedIds.map((feedId) => ({
        feedId,
        status: 'queued',
        errorMessage: null,
      })),
    });

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  return persistAggregate(pool, input.runId, userId);
}

export async function markFeedRefreshRunItemRunning(
  pool: Pool,
  input: { runId: string; feedId: string; userId?: string },
): Promise<FeedRefreshRunRow | null> {
  const userId = normalizeUserId(input.userId);
  await upsertFeedRefreshRunItems(pool, {
    runId: input.runId,
    userId,
    items: [{ feedId: input.feedId, status: 'running', errorMessage: null }],
  });

  return persistAggregate(pool, input.runId, userId);
}

export async function completeFeedRefreshRunItem(
  pool: Pool,
  input: {
    runId: string;
    feedId: string;
    status: 'succeeded' | 'failed';
    errorMessage?: string | null;
    userId?: string;
  },
): Promise<FeedRefreshRunRow | null> {
  const userId = normalizeUserId(input.userId);
  await upsertFeedRefreshRunItems(pool, {
    runId: input.runId,
    userId,
    items: [
      {
        feedId: input.feedId,
        status: input.status,
        errorMessage: input.errorMessage ?? null,
      },
    ],
  });

  return persistAggregate(pool, input.runId, userId);
}
