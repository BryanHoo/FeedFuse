import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export type AiDigestRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped_no_updates';

export interface AiDigestConfigRow {
  feedId: string;
  prompt: string;
  intervalMinutes: number;
  topN: number;
  selectedFeedIds: string[];
  selectedCategoryIds: string[];
  lastWindowEndAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiDigestRunRow {
  id: string;
  feedId: string;
  windowStartAt: string;
  windowEndAt: string;
  status: AiDigestRunStatus;
  candidateTotal: number;
  selectedCount: number;
  articleId: string | null;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function createAiDigestConfig(
  db: DbClient,
  input: {
    feedId: string;
    prompt: string;
    intervalMinutes: number;
    topN?: number;
    selectedFeedIds: string[];
    selectedCategoryIds: string[];
    lastWindowEndAt: string;
  },
): Promise<AiDigestConfigRow> {
  const { rows } = await db.query<AiDigestConfigRow>(
    `
      insert into ai_digest_configs(
        feed_id,
        prompt,
        interval_minutes,
        top_n,
        selected_feed_ids,
        selected_category_ids,
        last_window_end_at
      )
      values ($1, $2, $3, $4, $5::uuid[], $6::uuid[], $7::timestamptz)
      returning
        feed_id as "feedId",
        prompt,
        interval_minutes as "intervalMinutes",
        top_n as "topN",
        selected_feed_ids as "selectedFeedIds",
        selected_category_ids as "selectedCategoryIds",
        last_window_end_at as "lastWindowEndAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      input.feedId,
      input.prompt,
      input.intervalMinutes,
      input.topN ?? 10,
      input.selectedFeedIds,
      input.selectedCategoryIds,
      input.lastWindowEndAt,
    ],
  );
  return rows[0];
}

export async function getAiDigestConfigByFeedId(
  db: DbClient,
  feedId: string,
): Promise<AiDigestConfigRow | null> {
  const { rows } = await db.query<AiDigestConfigRow>(
    `
      select
        feed_id as "feedId",
        prompt,
        interval_minutes as "intervalMinutes",
        top_n as "topN",
        selected_feed_ids as "selectedFeedIds",
        selected_category_ids as "selectedCategoryIds",
        last_window_end_at as "lastWindowEndAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from ai_digest_configs
      where feed_id = $1
      limit 1
    `,
    [feedId],
  );
  return rows[0] ?? null;
}

export async function updateAiDigestConfigLastWindowEndAt(
  db: DbClient,
  feedId: string,
  lastWindowEndAt: string,
): Promise<void> {
  await db.query(
    `
      update ai_digest_configs
      set
        last_window_end_at = $2::timestamptz,
        updated_at = now()
      where feed_id = $1
    `,
    [feedId, lastWindowEndAt],
  );
}

export async function listDueAiDigestConfigFeedIds(
  db: DbClient,
  input: { now: Date },
): Promise<string[]> {
  const { rows } = await db.query<{ feedId: string }>(
    `
      select c.feed_id as "feedId"
      from ai_digest_configs c
      join feeds on feeds.id = c.feed_id
      where
        feeds.kind = 'ai_digest'
        and feeds.enabled = true
        and c.last_window_end_at <= ($1::timestamptz - (c.interval_minutes * interval '1 minute'))
      order by c.last_window_end_at asc, c.feed_id asc
    `,
    [input.now.toISOString()],
  );
  return rows.map((row) => row.feedId);
}

export async function getAiDigestRunByFeedIdAndWindowStartAt(
  db: DbClient,
  input: { feedId: string; windowStartAt: string },
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      select
        id,
        feed_id as "feedId",
        window_start_at as "windowStartAt",
        window_end_at as "windowEndAt",
        status,
        candidate_total as "candidateTotal",
        selected_count as "selectedCount",
        article_id as "articleId",
        model,
        error_code as "errorCode",
        error_message as "errorMessage",
        job_id as "jobId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from ai_digest_runs
      where feed_id = $1 and window_start_at = $2::timestamptz
      limit 1
    `,
    [input.feedId, input.windowStartAt],
  );
  return rows[0] ?? null;
}

export async function getAiDigestRunById(
  db: DbClient,
  runId: string,
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      select
        id,
        feed_id as "feedId",
        window_start_at as "windowStartAt",
        window_end_at as "windowEndAt",
        status,
        candidate_total as "candidateTotal",
        selected_count as "selectedCount",
        article_id as "articleId",
        model,
        error_code as "errorCode",
        error_message as "errorMessage",
        job_id as "jobId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from ai_digest_runs
      where id = $1
      limit 1
    `,
    [runId],
  );
  return rows[0] ?? null;
}

export async function createAiDigestRun(
  db: DbClient,
  input: {
    feedId: string;
    windowStartAt: string;
    windowEndAt: string;
    status: AiDigestRunStatus;
  },
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      insert into ai_digest_runs(feed_id, window_start_at, window_end_at, status)
      values ($1, $2::timestamptz, $3::timestamptz, $4)
      on conflict (feed_id, window_start_at) do nothing
      returning
        id,
        feed_id as "feedId",
        window_start_at as "windowStartAt",
        window_end_at as "windowEndAt",
        status,
        candidate_total as "candidateTotal",
        selected_count as "selectedCount",
        article_id as "articleId",
        model,
        error_code as "errorCode",
        error_message as "errorMessage",
        job_id as "jobId",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [input.feedId, input.windowStartAt, input.windowEndAt, input.status],
  );
  return rows[0] ?? null;
}

export async function updateAiDigestRun(
  db: DbClient,
  runId: string,
  patch: Partial<{
    status: AiDigestRunStatus;
    candidateTotal: number;
    selectedCount: number;
    articleId: string | null;
    model: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    jobId: string | null;
  }>,
): Promise<void> {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  let index = 1;

  if (typeof patch.status !== 'undefined') {
    fields.push(`status = $${index++}`);
    values.push(patch.status);
  }
  if (typeof patch.candidateTotal !== 'undefined') {
    fields.push(`candidate_total = $${index++}`);
    values.push(patch.candidateTotal);
  }
  if (typeof patch.selectedCount !== 'undefined') {
    fields.push(`selected_count = $${index++}`);
    values.push(patch.selectedCount);
  }
  if (typeof patch.articleId !== 'undefined') {
    fields.push(`article_id = $${index++}`);
    values.push(patch.articleId);
  }
  if (typeof patch.model !== 'undefined') {
    fields.push(`model = $${index++}`);
    values.push(patch.model);
  }
  if (typeof patch.errorCode !== 'undefined') {
    fields.push(`error_code = $${index++}`);
    values.push(patch.errorCode);
  }
  if (typeof patch.errorMessage !== 'undefined') {
    fields.push(`error_message = $${index++}`);
    values.push(patch.errorMessage);
  }
  if (typeof patch.jobId !== 'undefined') {
    fields.push(`job_id = $${index++}`);
    values.push(patch.jobId);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = now()');
  values.push(runId);

  await db.query(
    `
      update ai_digest_runs
      set ${fields.join(', ')}
      where id = $${index}
    `,
    values,
  );
}

export interface AiDigestCandidateArticleRow {
  id: string;
  feedId: string;
  feedTitle: string;
  title: string;
  summary: string | null;
  link: string | null;
  fetchedAt: string;
  contentFullHtml: string | null;
}

export async function listAiDigestCandidateArticles(
  db: DbClient,
  input: {
    targetFeedIds: string[];
    windowStartAt: string;
    windowEndAt: string;
    limit: number;
  },
): Promise<AiDigestCandidateArticleRow[]> {
  if (input.targetFeedIds.length === 0) return [];

  const { rows } = await db.query<AiDigestCandidateArticleRow>(
    `
      select
        a.id,
        a.feed_id as "feedId",
        f.title as "feedTitle",
        a.title,
        a.summary,
        a.link,
        a.fetched_at as "fetchedAt",
        a.content_full_html as "contentFullHtml"
      from articles a
      join feeds f on f.id = a.feed_id
      where
        a.feed_id = any($1::uuid[])
        and a.fetched_at > $2::timestamptz
        and a.fetched_at <= $3::timestamptz
      order by a.fetched_at desc, a.id desc
      limit $4
    `,
    [input.targetFeedIds, input.windowStartAt, input.windowEndAt, input.limit],
  );
  return rows;
}

