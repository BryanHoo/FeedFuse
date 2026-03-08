import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../../features/settings/settingsSchema';
import { getServerEnv } from '../env';
import { buildImageProxyUrl, getOptionalImageProxySecret } from '../media/imageProxyUrl';
import { evaluateArticleBodyTranslationEligibility } from '../ai/articleTranslationEligibility';
import { listCategories } from '../repositories/categoriesRepo';
import { listFeeds } from '../repositories/feedsRepo';
import { getUiSettings } from '../repositories/settingsRepo';
import {
  getArticleKeywordsForFeed,
  matchesArticleKeywordFilter,
} from './articleKeywordFilter';

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

const ARTICLE_LIST_PREVIEW_IMAGE_WIDTH = 192;
const ARTICLE_LIST_PREVIEW_IMAGE_HEIGHT = 208;
const ARTICLE_LIST_PREVIEW_IMAGE_QUALITY = 55;

type ArticleKeywordFilter = ReturnType<typeof normalizePersistedSettings>['rss']['articleKeywordFilter'];

function rewritePreviewImage(previewImage: string | null): string | null {
  if (!previewImage) return null;

  const secret = getOptionalImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (!secret) return previewImage;

  return buildImageProxyUrl({
    sourceUrl: previewImage,
    secret,
    width: ARTICLE_LIST_PREVIEW_IMAGE_WIDTH,
    height: ARTICLE_LIST_PREVIEW_IMAGE_HEIGHT,
    quality: ARTICLE_LIST_PREVIEW_IMAGE_QUALITY,
  });
}

type ArticleQueryRow = ReaderSnapshotArticleItem & {
  sortPublishedAt: unknown;
  sourceLanguage: string | null;
  contentHtml: string | null;
  contentFullHtml: string | null;
};

async function queryArticleRows(
  pool: Pool,
  input: { view: string; limit: number; cursor?: string | null },
): Promise<ArticleQueryRow[]> {
  const { whereSql, params, limit } = buildArticleFilter(input);
  const queryParams = [...params, limit + 1];
  const limitParamIndex = queryParams.length;

  const { rows } = await pool.query<ArticleQueryRow>(
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

  return rows;
}

async function listVisibleArticleRows(
  pool: Pool,
  input: { view: string; limit: number; cursor?: string | null },
  filterSettings: ArticleKeywordFilter,
): Promise<{ rows: ArticleQueryRow[]; nextCursor: string | null }> {
  const visible: ArticleQueryRow[] = [];
  const batchLimit = Math.max(input.limit * 2, DEFAULT_LIMIT);
  let cursor = input.cursor ?? null;
  let nextCursor: string | null = null;
  let iterations = 0;

  while (visible.length < input.limit + 1 && iterations < 5) {
    iterations += 1;
    const batch = await queryArticleRows(pool, {
      ...input,
      cursor,
      limit: batchLimit,
    });

    if (batch.length === 0) {
      break;
    }

    for (const row of batch) {
      cursor = encodeCursor({
        publishedAt: String(row.sortPublishedAt),
        id: row.id,
      });

      const keywords = getArticleKeywordsForFeed(filterSettings, row.feedId);
      if (matchesArticleKeywordFilter({ title: row.title, summary: row.summary }, keywords)) {
        continue;
      }

      visible.push(row);
      if (visible.length === input.limit + 1) {
        nextCursor = cursor;
        break;
      }
    }

    if (batch.length < batchLimit || nextCursor) {
      break;
    }
  }

  return {
    rows: visible.slice(0, input.limit),
    nextCursor,
  };
}

export async function getReaderSnapshot(
  pool: Pool,
  input: { view: string; limit?: number; cursor?: string | null },
): Promise<ReaderSnapshot> {
  const [categories, feeds, rawSettings] = await Promise.all([
    listCategories(pool),
    listFeeds(pool),
    getUiSettings(pool),
  ]);
  const settings = normalizePersistedSettings(rawSettings);

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

  const { limit } = buildArticleFilter(input);
  const { rows, nextCursor } = await listVisibleArticleRows(
    pool,
    {
      view: input.view,
      limit,
      cursor: input.cursor,
    },
    settings.rss.articleKeywordFilter,
  );

  return {
    categories,
    feeds: feedsWithUnread,
    articles: {
      items: rows.map((item) => {
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
          previewImage: rewritePreviewImage(rest.previewImage),
          bodyTranslationEligible: eligibility.bodyTranslationEligible,
          bodyTranslationBlockedReason: eligibility.bodyTranslationBlockedReason,
        };
      }),
      nextCursor,
    },
  };
}
