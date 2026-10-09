import type { DbClient } from '@/server/domains/articles/repositories/articlesRepo';
import { normalizeUserId } from '@/server/domains/users/userScope';

export interface PendingArticleFilterCandidate {
  articleId: string;
  userId: string;
  fullTextOnFetchEnabled: boolean;
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  titleTranslateEnabled: boolean;
}

export async function listPendingArticleFilterIds(
  db: DbClient,
  input: { userId: string; afterId: string | null; limit: number },
): Promise<string[]> {
  const { rows } = await db.query<{ articleId: string }>(
    `
      select a.id::text as "articleId"
      from articles a
      join feeds f on f.id = a.feed_id and f.user_id = a.user_id
      where a.user_id = $1 and a.filter_status = 'pending'
        and f.kind = 'rss' and f.provider = 'local_rss'
        and ($2::bigint is null or a.id > $2::bigint)
        and not exists (
          select 1 from article_media_attachments m
          where m.article_id = a.id and m.user_id = a.user_id
        )
      order by a.id
      limit $3
    `,
    [normalizeUserId(input.userId), input.afterId, input.limit],
  );
  return rows.map((row) => row.articleId);
}

export async function getPendingArticleFilterForUpdate(
  db: DbClient,
  articleId: string,
  userId: string,
): Promise<PendingArticleFilterCandidate | null> {
  const { rows } = await db.query<PendingArticleFilterCandidate>(
    `
      select a.id::text as "articleId", a.user_id::text as "userId",
        f.full_text_on_fetch_enabled as "fullTextOnFetchEnabled",
        f.ai_summary_on_fetch_enabled as "aiSummaryOnFetchEnabled",
        f.body_translate_on_fetch_enabled as "bodyTranslateOnFetchEnabled",
        f.title_translate_enabled as "titleTranslateEnabled"
      from articles a
      join feeds f on f.id = a.feed_id and f.user_id = a.user_id
      where a.id = $1 and a.user_id = $2 and a.filter_status = 'pending'
        and f.kind = 'rss' and f.provider = 'local_rss'
        and not exists (
          select 1 from article_media_attachments m
          where m.article_id = a.id and m.user_id = a.user_id
        )
      for update of a
    `,
    [articleId, normalizeUserId(userId)],
  );
  return rows[0] ?? null;
}
