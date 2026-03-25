import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export type FeedRefreshRunScope = 'single' | 'all';
export type FeedRefreshRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface FeedRefreshRunRow {
  id: string;
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
  feedId: string;
  status: FeedRefreshRunStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

function selectFeedRefreshRunFields() {
  return `
    id,
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
  },
): Promise<FeedRefreshRunRow> {
  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      insert into feed_refresh_runs (
        scope,
        status,
        feed_id,
        total_count,
        succeeded_count,
        failed_count,
        error_message,
        finished_at
      )
      values ($1, $2, $3::bigint, $4, $5, $6, $7, $8::timestamptz)
      returning ${selectFeedRefreshRunFields()}
    `,
    [
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
  }>,
): Promise<FeedRefreshRunRow | null> {
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
    return getFeedRefreshRunById(db, runId);
  }

  fields.push('updated_at = now()');
  values.push(runId);

  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      update feed_refresh_runs
      set ${fields.join(', ')}
      where id = $${paramIndex}::bigint
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
  },
): Promise<void> {
  if (input.items.length === 0) {
    return;
  }

  const feedIds = input.items.map((item) => item.feedId);
  const statuses = input.items.map((item) => item.status);
  const errorMessages = input.items.map((item) => item.errorMessage ?? null);

  await db.query(
    `
      insert into feed_refresh_run_items (
        run_id,
        feed_id,
        status,
        error_message
      )
      select
        $1::bigint,
        item.feed_id::bigint,
        item.status,
        item.error_message
      from unnest($2::bigint[], $3::text[], $4::text[]) as item(feed_id, status, error_message)
      on conflict (run_id, feed_id)
      do update set
        status = excluded.status,
        error_message = excluded.error_message,
        updated_at = now()
    `,
    [input.runId, feedIds, statuses, errorMessages],
  );
}

export async function listFeedRefreshRunItemsByRunId(
  db: DbClient,
  runId: string,
): Promise<FeedRefreshRunItemRow[]> {
  const { rows } = await db.query<FeedRefreshRunItemRow>(
    `
      select ${selectFeedRefreshRunItemFields()}
      from feed_refresh_run_items
      where run_id = $1::bigint
      order by feed_id asc
    `,
    [runId],
  );

  return rows;
}

export async function getFeedRefreshRunById(
  db: DbClient,
  runId: string,
): Promise<FeedRefreshRunRow | null> {
  const { rows } = await db.query<FeedRefreshRunRow>(
    `
      select ${selectFeedRefreshRunFields()}
      from feed_refresh_runs
      where id = $1::bigint
      limit 1
    `,
    [runId],
  );

  return rows[0] ?? null;
}
