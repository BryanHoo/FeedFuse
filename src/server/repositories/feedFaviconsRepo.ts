import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface FeedFaviconCacheRow {
  feedId: string;
  fetchStatus: 'ready' | 'failed';
  sourceUrl: string | null;
  contentType: string | null;
  body: Buffer | null;
  etag: string | null;
  lastModified: string | null;
  failureReason: string | null;
  nextRetryAt: string | null;
  fetchedAt: string;
  updatedAt: string;
}

export async function getFeedFaviconCache(
  db: DbClient,
  feedId: string,
): Promise<FeedFaviconCacheRow | null> {
  const { rows } = await db.query<FeedFaviconCacheRow>(
    `
      select
        feed_id as "feedId",
        fetch_status as "fetchStatus",
        source_url as "sourceUrl",
        content_type as "contentType",
        body,
        etag,
        last_modified as "lastModified",
        failure_reason as "failureReason",
        next_retry_at as "nextRetryAt",
        fetched_at as "fetchedAt",
        updated_at as "updatedAt"
      from feed_favicons
      where feed_id = $1
      limit 1
    `,
    [feedId],
  );

  return rows[0] ?? null;
}

export async function upsertFeedFaviconCache(
  db: DbClient,
  input: {
    feedId: string;
    sourceUrl: string;
    contentType: string;
    body: Buffer;
    etag?: string | null;
    lastModified?: string | null;
  },
): Promise<void> {
  await db.query(
    `
      insert into feed_favicons(
        feed_id,
        fetch_status,
        source_url,
        content_type,
        body,
        etag,
        last_modified,
        failure_reason,
        next_retry_at
      )
      values ($1, 'ready', $2, $3, $4, $5, $6, null, null)
      on conflict (feed_id) do update
      set
        fetch_status = 'ready',
        source_url = excluded.source_url,
        content_type = excluded.content_type,
        body = excluded.body,
        etag = excluded.etag,
        last_modified = excluded.last_modified,
        failure_reason = null,
        next_retry_at = null,
        fetched_at = now(),
        updated_at = now()
    `,
    [
      input.feedId,
      input.sourceUrl,
      input.contentType,
      input.body,
      input.etag ?? null,
      input.lastModified ?? null,
    ],
  );
}

export async function upsertFeedFaviconFailure(
  db: DbClient,
  input: {
    feedId: string;
    failureReason: string;
    nextRetryAt: string;
  },
): Promise<void> {
  await db.query(
    `
      insert into feed_favicons(
        feed_id,
        fetch_status,
        source_url,
        content_type,
        body,
        etag,
        last_modified,
        failure_reason,
        next_retry_at
      )
      values ($1, 'failed', null, null, null, null, null, $2, $3)
      on conflict (feed_id) do update
      set
        fetch_status = 'failed',
        source_url = null,
        content_type = null,
        body = null,
        etag = null,
        last_modified = null,
        failure_reason = excluded.failure_reason,
        next_retry_at = excluded.next_retry_at,
        fetched_at = now(),
        updated_at = now()
    `,
    [input.feedId, input.failureReason, input.nextRetryAt],
  );
}

export async function deleteFeedFaviconCache(db: DbClient, feedId: string): Promise<void> {
  await db.query(
    `
      delete from feed_favicons
      where feed_id = $1
    `,
    [feedId],
  );
}
