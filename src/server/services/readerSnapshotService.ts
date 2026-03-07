import type { Pool } from 'pg';
import { evaluateArticleBodyTranslationEligibility } from '../ai/articleTranslationEligibility';
import { listCategories } from '../repositories/categoriesRepo';
import { listFeeds } from '../repositories/feedsRepo';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface CursorPayload {
  publishedAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<CursorPayload>;
    if (!parsed || typeof parsed.publishedAt !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }
    return { publishedAt: parsed.publishedAt, id: parsed.id };
  } catch {
    return null;
  }
}

export function buildArticleFilter(input: {
  view: string;
  cursor?: string | null;
  limit?: number;
}): { whereSql: string; params: unknown[]; limit: number } {
  const whereParts: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.view === 'unread') {
    whereParts.push('is_read = false');
  } else if (input.view === 'starred') {
    whereParts.push('is_starred = true');
  } else if (input.view !== 'all') {
    whereParts.push(`feed_id = $${paramIndex++}`);
    params.push(input.view);
  }

  const decodedCursor = decodeCursor(input.cursor);
  if (decodedCursor) {
    whereParts.push(
      `(coalesce(published_at, 'epoch'::timestamptz), id) < ($${paramIndex++}, $${paramIndex++})`,
    );
    params.push(decodedCursor.publishedAt, decodedCursor.id);
  }

  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT)),
  );

  return {
    whereSql: whereParts.length ? `where ${whereParts.join(' and ')}` : '',
    params,
    limit,
  };
}

export interface ReaderSnapshotArticleItem {
  id: string;
  feedId: string;
  title: string;
  titleOriginal: string | null;
  titleZh: string | null;
  summary: string | null;
  previewImage: string | null;
  author: string | null;
  publishedAt: string | null;
  link: string | null;
  isRead: boolean;
  isStarred: boolean;
  bodyTranslationEligible: boolean;
  bodyTranslationBlockedReason: string | null;
}

export interface ReaderSnapshotFeed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  iconUrl: string | null;
  enabled: boolean;
  fullTextOnOpenEnabled: boolean;
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
  unreadCount: number;
}

export interface ReaderSnapshot {
  categories: Awaited<ReturnType<typeof listCategories>>;
  feeds: ReaderSnapshotFeed[];
  articles: {
    items: ReaderSnapshotArticleItem[];
    nextCursor: string | null;
  };
}

export async function getReaderSnapshot(
  pool: Pool,
  input: { view: string; limit?: number; cursor?: string | null },
): Promise<ReaderSnapshot> {
  const [categories, feeds] = await Promise.all([
    listCategories(pool),
    listFeeds(pool),
  ]);

  const { rows: unreadRows } = await pool.query<{
    feedId: string;
    unreadCount: number;
  }>(`
    select feed_id as "feedId", count(*)::int as "unreadCount"
    from articles
    where is_read = false
    group by feed_id
  `);

  const unreadByFeedId = new Map<string, number>();
  for (const row of unreadRows) {
    unreadByFeedId.set(row.feedId, row.unreadCount);
  }

  const feedsWithUnread: ReaderSnapshotFeed[] = feeds.map((feed) => ({
    ...feed,
    unreadCount: unreadByFeedId.get(feed.id) ?? 0,
  }));

  const { whereSql, params, limit } = buildArticleFilter(input);
  const queryParams = [...params, limit + 1];
  const limitParamIndex = queryParams.length;

  const { rows } = await pool.query<
    ReaderSnapshotArticleItem & {
      sortPublishedAt: unknown;
      sourceLanguage: string | null;
      contentHtml: string | null;
      contentFullHtml: string | null;
    }
  >(
    `
      select
        id,
        feed_id as "feedId",
        title,
        title_original as "titleOriginal",
        title_zh as "titleZh",
        summary,
        coalesce(
          preview_image_url,
          substring(content_full_html from '<img[^>]+src=["'']([^"''>]+)["'']'),
          substring(content_html from '<img[^>]+src=["'']([^"''>]+)["'']')
        ) as "previewImage",
        author,
        published_at as "publishedAt",
        link,
        source_language as "sourceLanguage",
        content_html as "contentHtml",
        content_full_html as "contentFullHtml",
        is_read as "isRead",
        is_starred as "isStarred",
        coalesce(published_at, 'epoch'::timestamptz) as "sortPublishedAt"
      from articles
      ${whereSql}
      order by "sortPublishedAt" desc, id desc
      limit $${limitParamIndex}
    `,
    queryParams,
  );

  let nextCursor: string | null = null;
  let items = rows;
  if (items.length > limit) {
    const next = items[limit];
    nextCursor = encodeCursor({
      publishedAt: String(next.sortPublishedAt),
      id: next.id,
    });
    items = items.slice(0, limit);
  }

  return {
    categories,
    feeds: feedsWithUnread,
    articles: {
      items: items.map((item) => {
        const {
          sortPublishedAt,
          sourceLanguage,
          contentHtml,
          contentFullHtml,
          ...rest
        } = item;
        const eligibility = evaluateArticleBodyTranslationEligibility({
          sourceLanguage,
          contentHtml,
          contentFullHtml,
          summary: item.summary,
        });
        void sortPublishedAt;
        return {
          ...rest,
          bodyTranslationEligible: eligibility.bodyTranslationEligible,
          bodyTranslationBlockedReason: eligibility.bodyTranslationBlockedReason,
        };
      }),
      nextCursor,
    },
  };
}
