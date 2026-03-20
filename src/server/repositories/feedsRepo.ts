import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export type FeedKind = 'rss' | 'ai_digest';

export interface FeedRow {
  id: string;
  kind: FeedKind;
  title: string;
  url: string;
  siteUrl: string | null;
  iconUrl: string | null;
  enabled: boolean;
  fullTextOnOpenEnabled: boolean;
  fullTextOnFetchEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
  articleListDisplayMode: 'card' | 'list';
  categoryId: string | null;
  fetchIntervalMinutes: number;
  lastFetchStatus: number | null;
  lastFetchError: string | null;
  lastFetchRawError: string | null;
}

export async function listFeeds(db: DbClient): Promise<FeedRow[]> {
  const { rows } = await db.query<FeedRow>(`
    select
      id,
      kind,
      title,
      url,
      site_url as "siteUrl",
      icon_url as "iconUrl",
      enabled,
      full_text_on_open_enabled as "fullTextOnOpenEnabled",
      full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
      ai_summary_on_open_enabled as "aiSummaryOnOpenEnabled",
      ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
      body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
      body_translate_on_open_enabled as "bodyTranslateOnOpenEnabled",
      title_translate_enabled as "titleTranslateEnabled",
      body_translate_enabled as "bodyTranslateEnabled",
      article_list_display_mode as "articleListDisplayMode",
      category_id as "categoryId",
      fetch_interval_minutes as "fetchIntervalMinutes",
      last_fetch_status as "lastFetchStatus",
      last_fetch_error as "lastFetchError",
      last_fetch_raw_error as "lastFetchRawError"
    from feeds
    order by created_at asc, id asc
  `);
  return rows;
}

export async function createFeed(
  db: DbClient,
  input: {
    title: string;
    url: string;
    siteUrl?: string | null;
    iconUrl?: string | null;
    enabled?: boolean;
    fullTextOnOpenEnabled?: boolean;
    fullTextOnFetchEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    aiSummaryOnFetchEnabled?: boolean;
    bodyTranslateOnFetchEnabled?: boolean;
    bodyTranslateOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    bodyTranslateEnabled?: boolean;
    articleListDisplayMode?: 'card' | 'list';
    categoryId?: string | null;
    fetchIntervalMinutes?: number;
  },
): Promise<FeedRow> {
  const { rows } = await db.query<FeedRow>(
    `
      insert into feeds(
        title,
        url,
        site_url,
        icon_url,
        enabled,
        full_text_on_open_enabled,
        full_text_on_fetch_enabled,
        ai_summary_on_open_enabled,
        ai_summary_on_fetch_enabled,
        body_translate_on_fetch_enabled,
        body_translate_on_open_enabled,
        title_translate_enabled,
        body_translate_enabled,
        article_list_display_mode,
        category_id,
        fetch_interval_minutes
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      returning
        id,
        kind,
        title,
        url,
        site_url as "siteUrl",
        icon_url as "iconUrl",
        enabled,
        full_text_on_open_enabled as "fullTextOnOpenEnabled",
        full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
        ai_summary_on_open_enabled as "aiSummaryOnOpenEnabled",
        ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
        body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
        body_translate_on_open_enabled as "bodyTranslateOnOpenEnabled",
        title_translate_enabled as "titleTranslateEnabled",
        body_translate_enabled as "bodyTranslateEnabled",
        article_list_display_mode as "articleListDisplayMode",
        category_id as "categoryId",
        fetch_interval_minutes as "fetchIntervalMinutes"
    `,
    [
      input.title,
      input.url,
      input.siteUrl ?? null,
      input.iconUrl ?? null,
      input.enabled ?? true,
      input.fullTextOnOpenEnabled ?? false,
      input.fullTextOnFetchEnabled ?? false,
      input.aiSummaryOnOpenEnabled ?? false,
      input.aiSummaryOnFetchEnabled ?? false,
      input.bodyTranslateOnFetchEnabled ?? false,
      input.bodyTranslateOnOpenEnabled ?? false,
      input.titleTranslateEnabled ?? false,
      input.bodyTranslateEnabled ?? false,
      input.articleListDisplayMode ?? 'card',
      input.categoryId ?? null,
      input.fetchIntervalMinutes ?? 30,
    ],
  );
  return rows[0];
}

export async function updateFeed(
  db: DbClient,
  id: string,
  input: {
    title?: string;
    url?: string;
    siteUrl?: string | null;
    iconUrl?: string | null;
    enabled?: boolean;
    fullTextOnOpenEnabled?: boolean;
    fullTextOnFetchEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    aiSummaryOnFetchEnabled?: boolean;
    bodyTranslateOnFetchEnabled?: boolean;
    bodyTranslateOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    bodyTranslateEnabled?: boolean;
    articleListDisplayMode?: 'card' | 'list';
    categoryId?: string | null;
    fetchIntervalMinutes?: number;
  },
): Promise<FeedRow | null> {
  const fields: string[] = [];
  const values: Array<string | boolean | number | null> = [];
  let paramIndex = 1;

  if (typeof input.title !== 'undefined') {
    fields.push(`title = $${paramIndex++}`);
    values.push(input.title);
  }
  if (typeof input.url !== 'undefined') {
    fields.push(`url = $${paramIndex++}`);
    values.push(input.url);
  }
  if (typeof input.siteUrl !== 'undefined') {
    fields.push(`site_url = $${paramIndex++}`);
    values.push(input.siteUrl);
  }
  if (typeof input.iconUrl !== 'undefined') {
    fields.push(`icon_url = $${paramIndex++}`);
    values.push(input.iconUrl);
  }
  if (typeof input.enabled !== 'undefined') {
    fields.push(`enabled = $${paramIndex++}`);
    values.push(input.enabled);
  }
  if (typeof input.fullTextOnOpenEnabled !== 'undefined') {
    fields.push(`full_text_on_open_enabled = $${paramIndex++}`);
    values.push(Boolean(input.fullTextOnOpenEnabled));
  }
  if (typeof input.fullTextOnFetchEnabled !== 'undefined') {
    fields.push(`full_text_on_fetch_enabled = $${paramIndex++}`);
    values.push(Boolean(input.fullTextOnFetchEnabled));
  }
  if (typeof input.aiSummaryOnOpenEnabled !== 'undefined') {
    fields.push(`ai_summary_on_open_enabled = $${paramIndex++}`);
    values.push(Boolean(input.aiSummaryOnOpenEnabled));
  }
  if (typeof input.aiSummaryOnFetchEnabled !== 'undefined') {
    fields.push(`ai_summary_on_fetch_enabled = $${paramIndex++}`);
    values.push(Boolean(input.aiSummaryOnFetchEnabled));
  }
  if (typeof input.bodyTranslateOnFetchEnabled !== 'undefined') {
    fields.push(`body_translate_on_fetch_enabled = $${paramIndex++}`);
    values.push(Boolean(input.bodyTranslateOnFetchEnabled));
  }
  if (typeof input.bodyTranslateOnOpenEnabled !== 'undefined') {
    fields.push(`body_translate_on_open_enabled = $${paramIndex++}`);
    values.push(Boolean(input.bodyTranslateOnOpenEnabled));
  }
  if (typeof input.titleTranslateEnabled !== 'undefined') {
    fields.push(`title_translate_enabled = $${paramIndex++}`);
    values.push(Boolean(input.titleTranslateEnabled));
  }
  if (typeof input.bodyTranslateEnabled !== 'undefined') {
    fields.push(`body_translate_enabled = $${paramIndex++}`);
    values.push(Boolean(input.bodyTranslateEnabled));
  }
  if (typeof input.articleListDisplayMode !== 'undefined') {
    fields.push(`article_list_display_mode = $${paramIndex++}`);
    values.push(input.articleListDisplayMode);
  }
  if (typeof input.categoryId !== 'undefined') {
    fields.push(`category_id = $${paramIndex++}`);
    values.push(input.categoryId);
  }
  if (typeof input.fetchIntervalMinutes !== 'undefined') {
    fields.push(`fetch_interval_minutes = $${paramIndex++}`);
    values.push(input.fetchIntervalMinutes);
  }
  if (fields.length === 0) return null;

  fields.push('updated_at = now()');
  values.push(id);

  const { rows } = await db.query<FeedRow>(
    `
      update feeds
      set ${fields.join(', ')}
      where id = $${paramIndex}
      returning
        id,
        kind,
        title,
        url,
        site_url as "siteUrl",
        icon_url as "iconUrl",
        enabled,
        full_text_on_open_enabled as "fullTextOnOpenEnabled",
        full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
        ai_summary_on_open_enabled as "aiSummaryOnOpenEnabled",
        ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
        body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
        body_translate_on_open_enabled as "bodyTranslateOnOpenEnabled",
        title_translate_enabled as "titleTranslateEnabled",
        body_translate_enabled as "bodyTranslateEnabled",
        article_list_display_mode as "articleListDisplayMode",
        category_id as "categoryId",
        fetch_interval_minutes as "fetchIntervalMinutes"
    `,
    values,
  );
  return rows[0] ?? null;
}

export async function deleteFeed(db: DbClient, id: string): Promise<boolean> {
  const res = await db.query('delete from feeds where id = $1', [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function getFeedCategoryAssignment(
  db: DbClient,
  id: string,
): Promise<{ id: string; categoryId: string | null } | null> {
  const { rows } = await db.query<{ id: string; categoryId: string | null }>(
    `
      select id, category_id as "categoryId"
      from feeds
      where id = $1
      limit 1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function countFeedsByCategoryId(
  db: DbClient,
  categoryId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `
      select count(*)::int as count
      from feeds
      where category_id = $1
    `,
    [categoryId],
  );
  return rows[0]?.count ?? 0;
}

export async function getFeedFullTextOnOpenEnabled(
  db: DbClient,
  id: string,
): Promise<boolean | null> {
  const { rows } = await db.query<{ fullTextOnOpenEnabled: boolean }>(
    `
      select full_text_on_open_enabled as "fullTextOnOpenEnabled"
      from feeds
      where id = $1
      limit 1
    `,
    [id],
  );
  return typeof rows[0]?.fullTextOnOpenEnabled === 'boolean'
    ? rows[0].fullTextOnOpenEnabled
    : null;
}

export async function getFeedBodyTranslateEnabled(
  db: DbClient,
  id: string,
): Promise<boolean | null> {
  const { rows } = await db.query<{ bodyTranslateEnabled: boolean }>(
    `
      select body_translate_enabled as "bodyTranslateEnabled"
      from feeds
      where id = $1
      limit 1
    `,
    [id],
  );
  return typeof rows[0]?.bodyTranslateEnabled === 'boolean'
    ? rows[0].bodyTranslateEnabled
    : null;
}

export interface FeedFetchRow {
  id: string;
  url: string;
  enabled: boolean;
  fullTextOnFetchEnabled: boolean;
  titleTranslateEnabled: boolean;
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  etag: string | null;
  lastModified: string | null;
  fetchIntervalMinutes: number;
  lastFetchedAt: string | null;
}

export async function listEnabledFeedsForFetch(db: DbClient): Promise<FeedFetchRow[]> {
  const { rows } = await db.query<FeedFetchRow>(`
    select
      id,
      url,
      enabled,
      full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
      title_translate_enabled as "titleTranslateEnabled",
      ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
      body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
      etag,
      last_modified as "lastModified",
      fetch_interval_minutes as "fetchIntervalMinutes",
      last_fetched_at as "lastFetchedAt"
    from feeds
    where enabled = true and kind = 'rss'
    order by created_at asc, id asc
  `);
  return rows;
}

export async function getFeedForFetch(
  db: DbClient,
  id: string,
): Promise<FeedFetchRow | null> {
  const { rows } = await db.query<FeedFetchRow>(
    `
      select
        id,
        url,
        enabled,
        full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
        title_translate_enabled as "titleTranslateEnabled",
        ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
        body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
        etag,
        last_modified as "lastModified",
        fetch_interval_minutes as "fetchIntervalMinutes",
        last_fetched_at as "lastFetchedAt"
      from feeds
      where id = $1 and kind = 'rss'
      limit 1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function recordFeedFetchResult(
  db: DbClient,
  id: string,
  input: {
    status: number | null;
    etag?: string | null;
    lastModified?: string | null;
    error?: string | null;
    rawError?: string | null;
  },
): Promise<void> {
  await db.query(
    `
      update feeds
      set
        etag = coalesce($2, etag),
        last_modified = coalesce($3, last_modified),
        last_fetched_at = now(),
        last_fetch_status = $4,
        last_fetch_error = $5,
        last_fetch_raw_error = $6,
        updated_at = now()
      where id = $1
    `,
    [
      id,
      input.etag ?? null,
      input.lastModified ?? null,
      input.status,
      input.error ?? null,
      input.rawError ?? null,
    ],
  );
}

export async function updateAllFeedsFetchIntervalMinutes(
  db: DbClient,
  minutes: number,
): Promise<{ updatedCount: number }> {
  const res = await db.query(
    `
      update feeds
      set
        fetch_interval_minutes = $1,
        updated_at = now()
      where kind = 'rss'
    `,
    [minutes],
  );

  return { updatedCount: res.rowCount ?? 0 };
}

export async function createAiDigestFeed(
  db: DbClient,
  input: { title: string; categoryId: string | null },
): Promise<FeedRow> {
  // Use one sequence-derived id for both PK and deterministic ai_digest URL suffix.
  const { rows } = await db.query<FeedRow>(
    `
      with next_feed as (
        select nextval(pg_get_serial_sequence('feeds', 'id'))::bigint as id
      )
      insert into feeds(id, kind, title, url, category_id)
      select
        next_feed.id,
        'ai_digest',
        $1,
        'http://localhost/__feedfuse_ai_digest__/' || next_feed.id::text,
        $2
      from next_feed
      returning
        id,
        kind,
        title,
        url,
        site_url as "siteUrl",
        icon_url as "iconUrl",
        enabled,
        full_text_on_open_enabled as "fullTextOnOpenEnabled",
        full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
        ai_summary_on_open_enabled as "aiSummaryOnOpenEnabled",
        ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
        body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
        body_translate_on_open_enabled as "bodyTranslateOnOpenEnabled",
        title_translate_enabled as "titleTranslateEnabled",
        body_translate_enabled as "bodyTranslateEnabled",
        article_list_display_mode as "articleListDisplayMode",
        category_id as "categoryId",
        fetch_interval_minutes as "fetchIntervalMinutes",
        last_fetch_status as "lastFetchStatus",
        last_fetch_error as "lastFetchError"
    `,
    [input.title, input.categoryId],
  );
  return rows[0];
}
