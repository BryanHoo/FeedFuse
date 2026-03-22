import type { Pool, PoolClient } from 'pg';

export type DbClient = Pool | PoolClient;

export type ArticleFilterStatus = 'pending' | 'passed' | 'filtered' | 'error';
export type ArticleDuplicateReason =
  | 'same_normalized_url'
  | 'same_title'
  | 'similar_content';

const articleRowColumnsSql = `
  id,
  feed_id as "feedId",
  dedupe_key as "dedupeKey",
  title,
  title_original as "titleOriginal",
  title_zh as "titleZh",
  title_translation_model as "titleTranslationModel",
  title_translation_attempts as "titleTranslationAttempts",
  title_translation_error as "titleTranslationError",
  title_translated_at as "titleTranslatedAt",
  link,
  author,
  published_at as "publishedAt",
  fetched_at as "fetchedAt",
  content_html as "contentHtml",
  content_full_html as "contentFullHtml",
  content_full_fetched_at as "contentFullFetchedAt",
  content_full_error as "contentFullError",
  content_full_source_url as "contentFullSourceUrl",
  preview_image_url as "previewImageUrl",
  ai_summary as "aiSummary",
  ai_summary_model as "aiSummaryModel",
  ai_summarized_at as "aiSummarizedAt",
  ai_translation_bilingual_html as "aiTranslationBilingualHtml",
  ai_translation_zh_html as "aiTranslationZhHtml",
  ai_translation_model as "aiTranslationModel",
  ai_translated_at as "aiTranslatedAt",
  summary,
  source_language as "sourceLanguage",
  normalized_title as "normalizedTitle",
  normalized_link as "normalizedLink",
  content_fingerprint as "contentFingerprint",
  duplicate_of_article_id as "duplicateOfArticleId",
  duplicate_reason as "duplicateReason",
  duplicate_score as "duplicateScore",
  duplicate_checked_at as "duplicateCheckedAt",
  filter_status as "filterStatus",
  is_filtered as "isFiltered",
  filtered_by as "filteredBy",
  filter_evaluated_at as "filterEvaluatedAt",
  filter_error_message as "filterErrorMessage",
  is_read as "isRead",
  read_at as "readAt",
  is_starred as "isStarred",
  starred_at as "starredAt"
`;

export interface ArticleRow {
  id: string;
  feedId: string;
  dedupeKey: string;
  title: string;
  titleOriginal: string;
  titleZh: string | null;
  titleTranslationModel: string | null;
  titleTranslationAttempts: number;
  titleTranslationError: string | null;
  titleTranslatedAt: string | null;
  link: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentHtml: string | null;
  contentFullHtml: string | null;
  contentFullFetchedAt: string | null;
  contentFullError: string | null;
  contentFullSourceUrl: string | null;
  previewImageUrl: string | null;
  aiSummary: string | null;
  aiSummaryModel: string | null;
  aiSummarizedAt: string | null;
  aiTranslationBilingualHtml: string | null;
  aiTranslationZhHtml: string | null;
  aiTranslationModel: string | null;
  aiTranslatedAt: string | null;
  summary: string | null;
  sourceLanguage: string | null;
  normalizedTitle: string | null;
  normalizedLink: string | null;
  contentFingerprint: string | null;
  duplicateOfArticleId: string | null;
  duplicateReason: ArticleDuplicateReason | null;
  duplicateScore: number | null;
  duplicateCheckedAt: string | null;
  filterStatus: ArticleFilterStatus;
  isFiltered: boolean;
  filteredBy: string[];
  filterEvaluatedAt: string | null;
  filterErrorMessage: string | null;
  isRead: boolean;
  readAt: string | null;
  isStarred: boolean;
  starredAt: string | null;
}

export async function insertArticleIgnoreDuplicate(
  pool: DbClient,
  input: {
    feedId: string;
    dedupeKey: string;
    title: string;
    link?: string | null;
    author?: string | null;
    publishedAt?: string | null;
    contentHtml?: string | null;
    previewImageUrl?: string | null;
    summary?: string | null;
    sourceLanguage?: string | null;
    filterStatus?: ArticleFilterStatus;
    isFiltered?: boolean;
    filteredBy?: string[];
    filterEvaluatedAt?: string | null;
    filterErrorMessage?: string | null;
  },
): Promise<ArticleRow | null> {
  const filterStatus = input.filterStatus ?? 'passed';
  const isFiltered = input.isFiltered ?? false;
  const filteredBy = input.filteredBy ?? [];
  const filterEvaluatedAt =
    typeof input.filterEvaluatedAt !== 'undefined'
      ? input.filterEvaluatedAt
      : filterStatus === 'pending'
        ? null
        : new Date().toISOString();

  const { rows } = await pool.query<ArticleRow>(
    `
      insert into articles(
        feed_id,
        dedupe_key,
        title,
        title_original,
        link,
        author,
        published_at,
        content_html,
        summary,
        preview_image_url,
        source_language,
        filter_status,
        is_filtered,
        filtered_by,
        filter_evaluated_at,
        filter_error_message
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      on conflict (feed_id, dedupe_key) do nothing
      returning ${articleRowColumnsSql}
    `,
    [
      input.feedId,
      input.dedupeKey,
      input.title,
      input.title,
      input.link ?? null,
      input.author ?? null,
      input.publishedAt ?? null,
      input.contentHtml ?? null,
      input.summary ?? null,
      input.previewImageUrl ?? null,
      input.sourceLanguage ?? null,
      filterStatus,
      isFiltered,
      filteredBy,
      filterEvaluatedAt,
      input.filterErrorMessage ?? null,
    ],
  );
  return rows[0] ?? null;
}

export async function getArticleById(
  pool: DbClient,
  id: string,
): Promise<ArticleRow | null> {
  const { rows } = await pool.query<ArticleRow>(
    `
      select ${articleRowColumnsSql}
      from articles
      where id = $1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function setArticleRead(
  pool: DbClient,
  id: string,
  isRead: boolean,
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        is_read = $2,
        read_at = case when $2 then coalesce(read_at, now()) else null end
      where id = $1
    `,
    [id, isRead],
  );
}

export async function setArticleStarred(
  pool: DbClient,
  id: string,
  isStarred: boolean,
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        is_starred = $2,
        starred_at = case when $2 then coalesce(starred_at, now()) else null end
      where id = $1
    `,
    [id, isStarred],
  );
}

export async function markAllRead(
  pool: DbClient,
  input: { feedId?: string },
): Promise<number> {
  const params: string[] = [];
  const values: string[] = [];
  let index = 1;

  if (input.feedId) {
    params.push(`feed_id = $${index++}`);
    values.push(input.feedId);
  } else {
    params.push("feed_id in (select id from feeds where kind = 'rss')");
  }

  const whereParts = [...params, 'is_read = false'];

  const { rowCount } = await pool.query(
    `
      update articles
      set
        is_read = true,
        read_at = coalesce(read_at, now())
      where ${whereParts.join(' and ')}
    `,
    values,
  );
  return rowCount ?? 0;
}

export async function setArticleFilterPending(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `
      update articles
      set
        filter_status = 'pending',
        is_filtered = false,
        filtered_by = '{}'::text[],
        normalized_title = null,
        normalized_link = null,
        content_fingerprint = null,
        duplicate_of_article_id = null,
        duplicate_reason = null,
        duplicate_score = null,
        duplicate_checked_at = null,
        filter_evaluated_at = null,
        filter_error_message = null
      where id = $1
    `,
    [id],
  );
}

export async function setArticleFilterResult(
  pool: DbClient,
  id: string,
  input: {
    filterStatus: Extract<ArticleFilterStatus, 'passed' | 'filtered' | 'error'>;
    isFiltered: boolean;
    filteredBy: string[];
    filterErrorMessage?: string | null;
    normalizedTitle?: string | null;
    normalizedLink?: string | null;
    contentFingerprint?: string | null;
    duplicateOfArticleId?: string | null;
    duplicateReason?: ArticleDuplicateReason | null;
    duplicateScore?: number | null;
  },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        filter_status = $2,
        is_filtered = $3,
        filtered_by = $4,
        filter_evaluated_at = now(),
        filter_error_message = $5,
        normalized_title = $6,
        normalized_link = $7,
        content_fingerprint = $8,
        duplicate_of_article_id = $9,
        duplicate_reason = $10,
        duplicate_score = $11,
        duplicate_checked_at = now()
      where id = $1
    `,
    [
      id,
      input.filterStatus,
      input.isFiltered,
      input.filteredBy,
      input.filterErrorMessage ?? null,
      input.normalizedTitle ?? null,
      input.normalizedLink ?? null,
      input.contentFingerprint ?? null,
      input.duplicateOfArticleId ?? null,
      input.duplicateReason ?? null,
      input.duplicateScore ?? null,
    ],
  );
}

export async function listArticleDuplicateCandidates(
  pool: DbClient,
  input: { articleId: string; publishedAt: string | null; fetchedAt: string },
): Promise<ArticleRow[]> {
  const { rows } = await pool.query<ArticleRow>(
    `
      -- Only compare against records that already existed so a newer article never replaces an earlier representative.
      select ${articleRowColumnsSql}
      from articles
      where id <> $1
        and (fetched_at < $3 or (fetched_at = $3 and id < $1::bigint))
        and coalesce(published_at, fetched_at) >= coalesce($2::timestamptz, $3::timestamptz) - interval '72 hours'
        and coalesce(published_at, fetched_at) <= coalesce($2::timestamptz, $3::timestamptz) + interval '72 hours'
      order by fetched_at asc, id asc
    `,
    [
      input.articleId,
      input.publishedAt,
      input.fetchedAt,
    ],
  );
  return rows;
}

export async function pruneFeedArticlesToLimit(
  db: DbClient,
  feedId: string,
  maxStoredArticlesPerFeed: number,
): Promise<{ deletedCount: number }> {
  const res = await db.query(
    `
      with overflow as (
        select greatest(count(*)::int - $2::int, 0) as overflow_count
        from articles
        where feed_id = $1
      ),
      deletable as (
        select id
        from articles
        where feed_id = $1
          and is_starred = false
        order by coalesce(published_at, fetched_at) asc, id asc
        limit (select overflow_count from overflow)
      )
      delete from articles
      where id in (select id from deletable)
    `,
    [feedId, maxStoredArticlesPerFeed],
  );

  return { deletedCount: res.rowCount ?? 0 };
}

export async function pruneAllFeedsArticlesToLimit(
  db: DbClient,
  maxStoredArticlesPerFeed: number,
): Promise<{ deletedCount: number }> {
  const res = await db.query(
    `
      with overflow as (
        select
          feed_id,
          greatest(count(*)::int - $1::int, 0) as overflow_count
        from articles
        group by feed_id
        having count(*) > $1::int
      ),
      ranked_unstarred as (
        select
          a.id,
          a.feed_id,
          row_number() over (
            partition by a.feed_id
            order by coalesce(a.published_at, a.fetched_at) asc, a.id asc
          ) as delete_rank
        from articles a
        join overflow o on o.feed_id = a.feed_id
        where a.is_starred = false
      ),
      deletable as (
        select r.id
        from ranked_unstarred r
        join overflow o on o.feed_id = r.feed_id
        where r.delete_rank <= o.overflow_count
      )
      delete from articles
      where id in (select id from deletable)
    `,
    [maxStoredArticlesPerFeed],
  );

  return { deletedCount: res.rowCount ?? 0 };
}

export async function setArticleFulltext(
  pool: Pool,
  id: string,
  input: { contentFullHtml: string; sourceUrl: string | null },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        content_full_html = $2,
        content_full_fetched_at = now(),
        content_full_error = null,
        content_full_source_url = $3
      where id = $1
    `,
    [id, input.contentFullHtml, input.sourceUrl],
  );
}

export async function setArticleAiSummary(
  pool: Pool,
  id: string,
  input: { aiSummary: string; aiSummaryModel: string },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        ai_summary = $2,
        ai_summary_model = $3,
        ai_summarized_at = now()
      where id = $1
    `,
    [id, input.aiSummary, input.aiSummaryModel],
  );
}

export async function setArticleAiTranslationZh(
  pool: Pool,
  id: string,
  input: { aiTranslationZhHtml: string; aiTranslationModel: string },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        ai_translation_zh_html = $2,
        ai_translation_model = $3,
        ai_translated_at = now()
      where id = $1
    `,
    [id, input.aiTranslationZhHtml, input.aiTranslationModel],
  );
}

export async function setArticleAiTranslationBilingual(
  pool: Pool,
  id: string,
  input: { aiTranslationBilingualHtml: string; aiTranslationModel: string },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        ai_translation_bilingual_html = $2,
        ai_translation_model = $3,
        ai_translated_at = now()
      where id = $1
    `,
    [id, input.aiTranslationBilingualHtml, input.aiTranslationModel],
  );
}

export async function setArticleTitleTranslation(
  pool: Pool,
  id: string,
  input: { titleZh: string; titleTranslationModel: string },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        title_zh = $2,
        title_translation_model = $3,
        title_translated_at = now(),
        title_translation_error = null
      where id = $1
    `,
    [id, input.titleZh, input.titleTranslationModel],
  );
}

export async function recordArticleTitleTranslationFailure(
  pool: Pool,
  id: string,
  input: { error: string },
): Promise<number> {
  const { rows } = await pool.query<{ titleTranslationAttempts: number }>(
    `
      update articles
      set
        title_translation_attempts = coalesce(title_translation_attempts, 0) + 1,
        title_translation_error = $2
      where id = $1
      returning title_translation_attempts as "titleTranslationAttempts"
    `,
    [id, input.error],
  );
  return rows[0]?.titleTranslationAttempts ?? 0;
}

export async function setArticleFulltextError(
  pool: Pool,
  id: string,
  input: { error: string; sourceUrl: string | null },
): Promise<void> {
  await pool.query(
    `
      update articles
      set
        content_full_error = $2,
        content_full_source_url = $3
      where id = $1
    `,
    [id, input.error, input.sourceUrl],
  );
}
