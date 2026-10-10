import type { Pool, PoolClient } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

type DbClient = Pool | PoolClient;

export type FeedRefreshRunScope = 'single' | 'all';
export type FeedRefreshRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface FeedRefreshRunRow {
  id: string;
  userId: string;
  scope: FeedRefreshRunScope;
  status: FeedRefreshRunStatus;
  feedId: string | null;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface FeedRefreshRunItemRow {
  runId: string;
  userId: string;
  feedId: string;
  status: FeedRefreshRunStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function selectFeedRefreshRunFields() {
  return `
    id,
    user_id as "userId",
    scope,
    status,
    feed_id as "feedId",
    total_count as "totalCount",
    succeeded_count as "succeededCount",
    failed_count as "failedCount",
    error_message as "errorMessage",
    created_at as "createdAt",
    updated_at as "updatedAt",
    finished_at as "finishedAt"
  `;
}

function selectFeedRefreshRunItemFields() {
  return `
    run_id as "runId",
    user_id as "userId",
    feed_id as "feedId",
    status,
    error_message as "errorMessage",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}

export async function createFeedRefreshRun(
  db: DbClient,
  input: {
    scope: FeedRefreshRunScope;
    status: FeedRefreshRunStatus;
    feedId?: string | null;
    totalCount: number;
    succeededCount?: number;
    failedCount?: number;
    errorMessage?: string | null;
    finishedAt?: string | null;
    userId?: string;
  },
): Promise<FeedRefreshRunRow> {
  const userId = normalizeUserId(input.userId);
  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      insert into feed_refresh_runs (
        user_id,
        scope,
        status,
        feed_id,
        total_count,
        succeeded_count,
        failed_count,
        error_message,
        finished_at
      )
      values ($1, $2, $3, $4::bigint, $5, $6, $7, $8, $9::timestamptz)
      returning ${selectFeedRefreshRunFields()}
    `,
    [
      userId,
      input.scope,
      input.status,
      input.feedId ?? null,
      input.totalCount,
      input.succeededCount ?? 0,
      input.failedCount ?? 0,
      input.errorMessage ?? null,
      input.finishedAt ?? null,
    ],
  );

  return rows[0];
}

export async function updateFeedRefreshRun(
  db: DbClient,
  runId: string,
  patch: Partial<{
    status: FeedRefreshRunStatus;
    totalCount: number;
    succeededCount: number;
    failedCount: number;
    errorMessage: string | null;
    finishedAt: string | null;
    userId?: string;
  }>,
): Promise<FeedRefreshRunRow | null> {
  const userId = normalizeUserId(patch.userId);
  const fields: string[] = [];
  const values: Array<number | string | null> = [];
  let paramIndex = 1;

  if (typeof patch.status !== 'undefined') {
    fields.push(`status = $${paramIndex++}`);
    values.push(patch.status);
  }
  if (typeof patch.totalCount !== 'undefined') {
    fields.push(`total_count = $${paramIndex++}`);
    values.push(patch.totalCount);
  }
  if (typeof patch.succeededCount !== 'undefined') {
    fields.push(`succeeded_count = $${paramIndex++}`);
    values.push(patch.succeededCount);
  }
  if (typeof patch.failedCount !== 'undefined') {
    fields.push(`failed_count = $${paramIndex++}`);
    values.push(patch.failedCount);
  }
  if (typeof patch.errorMessage !== 'undefined') {
    fields.push(`error_message = $${paramIndex++}`);
    values.push(patch.errorMessage);
  }
  if (typeof patch.finishedAt !== 'undefined') {
    fields.push(`finished_at = $${paramIndex++}::timestamptz`);
    values.push(patch.finishedAt);
  }

  if (fields.length === 0) {
    return getFeedRefreshRunById(db, runId, userId);
  }

  fields.push('updated_at = now()');
  values.push(runId);
  values.push(userId);

  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      update feed_refresh_runs
      set ${fields.join(', ')}
      where id = $${paramIndex}::bigint
        and user_id = $${paramIndex + 1}
      returning ${selectFeedRefreshRunFields()}
    `,
    values,
  );

  return rows[0] ?? null;
}

export async function upsertFeedRefreshRunItems(
  db: DbClient,
  input: {
    runId: string;
    items: Array<{
      feedId: string;
      status: FeedRefreshRunStatus;
      errorMessage?: string | null;
    }>;
    userId?: string;
  },
): Promise<void> {
  if (input.items.length === 0) {
    return;
  }

  const feedIds = input.items.map((item) => item.feedId);
  const statuses = input.items.map((item) => item.status);
  const errorMessages = input.items.map((item) => item.errorMessage ?? null);
  const userId = normalizeUserId(input.userId);

  await db.query(
    `
      insert into feed_refresh_run_items (
        user_id,
        run_id,
        feed_id,
        status,
        error_message
      )
      select
        $1,
        $2::bigint,
        item.feed_id::bigint,
        item.status,
        item.error_message
      from unnest($3::bigint[], $4::text[], $5::text[]) as item(feed_id, status, error_message)
      on conflict (user_id, run_id, feed_id)
      do update set
        status = excluded.status,
        error_message = excluded.error_message,
        updated_at = now()
    `,
    [userId, input.runId, feedIds, statuses, errorMessages],
  );
}

export async function listFeedRefreshRunItemsByRunId(
  db: DbClient,
  runId: string,
  userId?: string,
): Promise<FeedRefreshRunItemRow[]> {
  const { rows } = await db.query<FeedRefreshRunItemRow>(
    `
      select ${selectFeedRefreshRunItemFields()}
      from feed_refresh_run_items
      where run_id = $1::bigint
        and user_id = $2
      order by feed_id asc
    `,
    [runId, normalizeUserId(userId)],
  );

  return rows;
}

export async function getFeedRefreshRunById(
  db: DbClient,
  runId: string,
  userId?: string,
): Promise<FeedRefreshRunRow | null> {
  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      select ${selectFeedRefreshRunFields()}
      from feed_refresh_runs
      where id = $1::bigint
        and user_id = $2
      limit 1
    `,
    [runId, normalizeUserId(userId)],
  );

  return rows[0] ?? null;
}

export async function lockFeedRefreshRunById(
  client: PoolClient,
  runId: string,
  userId?: string,
): Promise<FeedRefreshRunRow | null> {
  // 必须在事务连接上调用，锁保持到提交或回滚；同一 run 的汇总先取得此锁再读取明细。
  // 汇总不修改主键，使用较弱的写锁，允许明细插入时对父 run 执行外键 KEY SHARE 检查。
  const { rows } = await client.query<FeedRefreshRunRow>(
    `
      select ${selectFeedRefreshRunFields()}
      from feed_refresh_runs
      where id = $1::bigint
        and user_id = $2
      for no key update
    `,
    [runId, normalizeUserId(userId)],
  );

  return rows[0] ?? null;
}
