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
  privateFmEnabled: boolean;
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
  privateFmEnabled: boolean;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiDigestRunSourceRow {
  runId: string;
  sourceArticleId: string;
  position: number;
  createdAt: string;
}

export interface AiDigestArticleSourceDetailRow {
  articleId: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  position: number;
}

export async function createAiDigestConfig(
  db: DbClient,
  input: {
    feedId: string;
    prompt: string;
    intervalMinutes: number;
    topN?: number;
    selectedFeedIds: string[];
    lastWindowEndAt: string;
    privateFmEnabled?: boolean;
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
        last_window_end_at,
        private_fm_enabled
      )
      values ($1, $2, $3, $4, $5::bigint[], '{}'::bigint[], $6::timestamptz, $7)
      returning
        feed_id as "feedId",
        prompt,
        interval_minutes as "intervalMinutes",
        top_n as "topN",
        selected_feed_ids as "selectedFeedIds",
        selected_category_ids as "selectedCategoryIds",
        last_window_end_at as "lastWindowEndAt",
        private_fm_enabled as "privateFmEnabled",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      input.feedId,
      input.prompt,
      input.intervalMinutes,
      input.topN ?? 500,
      input.selectedFeedIds,
      input.lastWindowEndAt,
      input.privateFmEnabled ?? false,
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
        private_fm_enabled as "privateFmEnabled",
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

export async function updateAiDigestConfig(
  db: DbClient,
  feedId: string,
  patch: Partial<{
    prompt: string;
    intervalMinutes: number;
    topN: number;
    selectedFeedIds: string[];
    lastWindowEndAt: string;
    privateFmEnabled: boolean;
  }>,
): Promise<AiDigestConfigRow | null> {
  const fields: string[] = [];
  const values: Array<string | number | string[] | boolean> = [];
  let paramIndex = 1;

  if (typeof patch.prompt !== 'undefined') {
    fields.push(`prompt = $${paramIndex++}`);
    values.push(patch.prompt);
  }
  if (typeof patch.intervalMinutes !== 'undefined') {
    fields.push(`interval_minutes = $${paramIndex++}`);
    values.push(patch.intervalMinutes);
  }
  if (typeof patch.topN !== 'undefined') {
    fields.push(`top_n = $${paramIndex++}`);
    values.push(patch.topN);
  }
  if (typeof patch.selectedFeedIds !== 'undefined') {
    fields.push(`selected_feed_ids = $${paramIndex++}::bigint[]`);
    values.push(patch.selectedFeedIds);
  }
  if (typeof patch.lastWindowEndAt !== 'undefined') {
    fields.push(`last_window_end_at = $${paramIndex++}::timestamptz`);
    values.push(patch.lastWindowEndAt);
  }
  if (typeof patch.privateFmEnabled !== 'undefined') {
    fields.push(`private_fm_enabled = $${paramIndex++}`);
    values.push(patch.privateFmEnabled);
  }
  if (fields.length === 0) {
    return getAiDigestConfigByFeedId(db, feedId);
  }

  fields.push('updated_at = now()');
  values.push(feedId);

  const { rows } = await db.query<AiDigestConfigRow>(
    `
      update ai_digest_configs
      set ${fields.join(', ')}
      where feed_id = $${paramIndex}
      returning
        feed_id as "feedId",
        prompt,
        interval_minutes as "intervalMinutes",
        top_n as "topN",
        selected_feed_ids as "selectedFeedIds",
        selected_category_ids as "selectedCategoryIds",
        last_window_end_at as "lastWindowEndAt",
        private_fm_enabled as "privateFmEnabled",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    values,
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
        false as "privateFmEnabled",
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

export async function getActiveAiDigestRunByFeedId(
  db: DbClient,
  feedId: string,
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      select
        ai_digest_runs.id,
        ai_digest_runs.feed_id as "feedId",
        ai_digest_runs.window_start_at as "windowStartAt",
        ai_digest_runs.window_end_at as "windowEndAt",
        ai_digest_runs.status,
        ai_digest_runs.candidate_total as "candidateTotal",
        ai_digest_runs.selected_count as "selectedCount",
        ai_digest_runs.article_id as "articleId",
        coalesce(c.private_fm_enabled, false) as "privateFmEnabled",
        ai_digest_runs.model,
        ai_digest_runs.error_code as "errorCode",
        ai_digest_runs.error_message as "errorMessage",
        ai_digest_runs.job_id as "jobId",
        ai_digest_runs.created_at as "createdAt",
        ai_digest_runs.updated_at as "updatedAt"
      from ai_digest_runs
      left join ai_digest_configs c on c.feed_id = ai_digest_runs.feed_id
      where ai_digest_runs.feed_id = $1 and ai_digest_runs.status in ('queued', 'running')
      order by ai_digest_runs.created_at desc, ai_digest_runs.id desc
      limit 1
    `,
    [feedId],
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
        ai_digest_runs.id,
        ai_digest_runs.feed_id as "feedId",
        ai_digest_runs.window_start_at as "windowStartAt",
        ai_digest_runs.window_end_at as "windowEndAt",
        ai_digest_runs.status,
        ai_digest_runs.candidate_total as "candidateTotal",
        ai_digest_runs.selected_count as "selectedCount",
        ai_digest_runs.article_id as "articleId",
        coalesce(c.private_fm_enabled, false) as "privateFmEnabled",
        ai_digest_runs.model,
        ai_digest_runs.error_code as "errorCode",
        ai_digest_runs.error_message as "errorMessage",
        ai_digest_runs.job_id as "jobId",
        ai_digest_runs.created_at as "createdAt",
        ai_digest_runs.updated_at as "updatedAt"
      from ai_digest_runs
      left join ai_digest_configs c on c.feed_id = ai_digest_runs.feed_id
      where ai_digest_runs.id = $1
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
        false as "privateFmEnabled",
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

export async function replaceAiDigestRunSources(
  db: DbClient,
  input: {
    runId: string;
    sources: Array<{ sourceArticleId: string; position: number }>;
  },
): Promise<void> {
  await db.query('delete from ai_digest_run_sources where run_id = $1', [input.runId]);
  if (input.sources.length === 0) return;

  const values: Array<string | number> = [input.runId];
  const placeholders = input.sources.map((source, index) => {
    const positionParam = index * 2 + 2;
    const articleParam = index * 2 + 3;
    values.push(source.position, source.sourceArticleId);
    return `($1, $${articleParam}::bigint, $${positionParam})`;
  });

  await db.query(
    `
      insert into ai_digest_run_sources(run_id, source_article_id, position)
      values ${placeholders.join(', ')}
    `,
    values,
  );
}

export async function listAiDigestRunSourcesByArticleId(
  db: DbClient,
  articleId: string,
): Promise<AiDigestArticleSourceDetailRow[]> {
  const { rows } = await db.query<AiDigestArticleSourceDetailRow>(
    `
      select
        a.id as "articleId",
        a.feed_id as "feedId",
        f.title as "feedTitle",
        a.title,
        a.link,
        a.published_at as "publishedAt",
        s.position
      from ai_digest_runs r
      join ai_digest_run_sources s on s.run_id = r.id
      join articles a on a.id = s.source_article_id
      join feeds f on f.id = a.feed_id
      where r.article_id = $1
      order by s.position asc
    `,
    [articleId],
  );
  return rows;
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
        a.feed_id = any($1::bigint[])
        and a.fetched_at > $2::timestamptz
        and a.fetched_at <= $3::timestamptz
        and a.filter_status = any('{passed,error}'::text[])
      order by a.fetched_at desc, a.id desc
      limit $4
    `,
    [input.targetFeedIds, input.windowStartAt, input.windowEndAt, input.limit],
  );
  return rows;
}
