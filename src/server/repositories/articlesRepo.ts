import type { Pool } from 'pg';

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
  isRead: boolean;
  readAt: string | null;
  isStarred: boolean;
  starredAt: string | null;
}

export async function insertArticleIgnoreDuplicate(
  pool: Pool,
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
  },
): Promise<ArticleRow | null> {
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
        source_language
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      on conflict (feed_id, dedupe_key) do nothing
      returning
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
        is_read as "isRead",
        read_at as "readAt",
        is_starred as "isStarred",
        starred_at as "starredAt"
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
    ],
  );
  return rows[0] ?? null;
}

export async function getArticleById(
  pool: Pool,
  id: string,
): Promise<ArticleRow | null> {
  const { rows } = await pool.query<ArticleRow>(
    `
      select
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
        is_read as "isRead",
        read_at as "readAt",
        is_starred as "isStarred",
        starred_at as "starredAt"
      from articles
      where id = $1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function setArticleRead(
  pool: Pool,
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
  pool: Pool,
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
  pool: Pool,
  input: { feedId?: string },
): Promise<number> {
  const params: string[] = [];
  const values: string[] = [];
  let index = 1;

  if (input.feedId) {
    params.push(`feed_id = $${index++}`);
    values.push(input.feedId);
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
