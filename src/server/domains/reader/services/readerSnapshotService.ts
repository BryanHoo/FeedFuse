import type { Pool } from 'pg';
import { AI_DIGEST_VIEW_ID, isRssSmartView } from '@/lib/reader/view';
import { normalizeSnapshotSummary, rewriteFeedIcon, rewritePreviewImage } from './readerSnapshotPresentation';
import { evaluateArticleBodyTranslationEligibility } from '@/server/integrations/ai/articleTranslationEligibility';
import { listCategories } from '@/server/domains/feeds/repositories/categoriesRepo';
import { listFeeds } from '@/server/domains/feeds/repositories/feedsRepo';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const ACTIVE_FEVER_ARTICLE_SQL = `
  not exists (
    select 1
    from fever_item_mappings fim
    where fim.local_article_id = articles.id
      and fim.user_id = articles.user_id
      and fim.is_active = false
  )
  and not exists (
    select 1
    from fever_item_mappings fim
    join fever_feed_mappings ffm
      on ffm.fever_account_id = fim.fever_account_id
      and ffm.fever_feed_id = fim.fever_feed_id
    left join fever_accounts fa
      on fa.id = ffm.fever_account_id
    where fim.local_article_id = articles.id
      and fim.user_id = articles.user_id
      and ffm.user_id = articles.user_id
      and fa.user_id = articles.user_id
      and (
        ffm.is_active = false
        or coalesce(fa.enabled, true) = false
      )
  )
`;

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

function serializeCursorPublishedAt(value: unknown): string {
  // Keep cursor payloads stable even when pg materializes timestamptz as Date objects.
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

export function buildArticleFilter(input: {
  view: string;
  userId?: string;
  cursor?: string | null;
  limit?: number;
  unreadOnly?: boolean;
  includeFiltered?: boolean;
}): { whereSql: string; params: unknown[]; limit: number } {
  const whereParts: string[] = ['articles.user_id = $1'];
  const params: unknown[] = [input.userId ?? '1'];
  let paramIndex = 2;

  if (input.view === AI_DIGEST_VIEW_ID) {
    whereParts.push("feed_id in (select id from feeds where user_id = $1 and kind = 'ai_digest')");
  } else if (input.view === 'unread') {
    whereParts.push('is_read = false');
  } else if (input.view === 'starred') {
    whereParts.push('is_starred = true');
  } else if (input.view !== 'all') {
    whereParts.push(`feed_id = $${paramIndex++}`);
    params.push(input.view);
  }

  if (isRssSmartView(input.view)) {
    whereParts.push("feed_id in (select id from feeds where user_id = $1 and kind = 'rss')");
  }

  if (input.unreadOnly) {
    whereParts.push('is_read = false');
  }

  const isSpecificFeedView =
    input.view !== 'all' &&
    input.view !== 'unread' &&
    input.view !== 'starred' &&
    input.view !== AI_DIGEST_VIEW_ID &&
    !isRssSmartView(input.view);
  const visibleStatuses =
    isSpecificFeedView && input.includeFiltered
      ? ['passed', 'error', 'filtered']
      : ['passed', 'error'];
  whereParts.push(`filter_status = any($${paramIndex++}::text[])`);
  params.push(visibleStatuses);

  const decodedCursor = decodeCursor(input.cursor);
  if (decodedCursor) {
    whereParts.push(
      `(coalesce(published_at, 'epoch'::timestamptz), articles.id) < ($${paramIndex++}, $${paramIndex++})`,
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
  filterStatus: 'pending' | 'passed' | 'filtered' | 'error';
  isFiltered: boolean;
  filteredBy: string[];
  isRead: boolean;
  isStarred: boolean;
  remoteSource: 'fever' | null;
  bodyTranslationEligible: boolean;
  bodyTranslationBlockedReason: string | null;
  aiSummarySession: {
    id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed';
    draftText: string;
    finalText: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    rawErrorMessage: string | null;
    startedAt: string;
    finishedAt: string | null;
    updatedAt: string;
  } | null;
}

export interface ReaderSnapshotFeed {
  id: string;
  kind: 'rss' | 'ai_digest';
  provider: 'local_rss' | 'fever';
  remoteManaged: boolean;
  remoteSource: 'fever' | null;
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
  unreadCount: number;
  isPodcast: boolean;
}

export interface ReaderSnapshot {
  categories: Awaited<ReturnType<typeof listCategories>>;
  feeds: ReaderSnapshotFeed[];
  articles: {
    items: ReaderSnapshotArticleItem[];
    nextCursor: string | null;
    totalCount: number;
  };
}

type ArticleQueryRow = ReaderSnapshotArticleItem & {
  sortPublishedAt: unknown;
  sourceLanguage: string | null;
  contentHtml: string | null;
  contentFullHtml: string | null;
  aiSummarySessionId: string | null;
  aiSummarySessionStatus: 'queued' | 'running' | 'succeeded' | 'failed' | null;
  aiSummarySessionDraftText: string | null;
  aiSummarySessionFinalText: string | null;
  aiSummarySessionErrorCode: string | null;
  aiSummarySessionErrorMessage: string | null;
  aiSummarySessionRawErrorMessage: string | null;
  aiSummarySessionStartedAt: string | null;
  aiSummarySessionFinishedAt: string | null;
  aiSummarySessionUpdatedAt: string | null;
};

async function queryArticleRows(
  pool: Pool,
  input: {
    view: string;
    limit: number;
    cursor?: string | null;
    unreadOnly?: boolean;
    includeFiltered?: boolean;
    userId?: string;
  },
): Promise<ArticleQueryRow[]> {
  const { whereSql, params, limit } = buildArticleFilter(input);
  const queryParams = [...params, limit + 1];
  const limitParamIndex = queryParams.length;

  const { rows } = await pool.query<ArticleQueryRow>(
    `
      select
        articles.id,
        articles.feed_id as "feedId",
        articles.title,
        articles.title_original as "titleOriginal",
        articles.title_zh as "titleZh",
        articles.summary,
        coalesce(
          preview_image_url,
          substring(articles.content_full_html from '<img[^>]+src=["'']([^"''>]+)["'']'),
          substring(articles.content_html from '<img[^>]+src=["'']([^"''>]+)["'']')
        ) as "previewImage",
        articles.author,
        articles.published_at as "publishedAt",
        articles.link,
        articles.filter_status as "filterStatus",
        articles.is_filtered as "isFiltered",
        articles.filtered_by as "filteredBy",
        articles.source_language as "sourceLanguage",
        articles.content_html as "contentHtml",
        articles.content_full_html as "contentFullHtml",
        articles.is_read as "isRead",
        articles.is_starred as "isStarred",
        case when feeds.provider = 'fever' then 'fever' else null end as "remoteSource",
        ai_summary_session.id as "aiSummarySessionId",
        ai_summary_session.status as "aiSummarySessionStatus",
        ai_summary_session.draft_text as "aiSummarySessionDraftText",
        ai_summary_session.final_text as "aiSummarySessionFinalText",
        ai_summary_session.error_code as "aiSummarySessionErrorCode",
        ai_summary_session.error_message as "aiSummarySessionErrorMessage",
        ai_summary_session.raw_error_message as "aiSummarySessionRawErrorMessage",
        ai_summary_session.started_at as "aiSummarySessionStartedAt",
        ai_summary_session.finished_at as "aiSummarySessionFinishedAt",
        ai_summary_session.updated_at as "aiSummarySessionUpdatedAt",
        coalesce(articles.published_at, 'epoch'::timestamptz) as "sortPublishedAt"
      from articles
      inner join feeds on feeds.id = articles.feed_id
        and feeds.user_id = articles.user_id
      left join lateral (
        select
          id,
          status,
          draft_text,
          final_text,
          error_code,
          error_message,
          raw_error_message,
          started_at,
          finished_at,
          updated_at
        from article_ai_summary_sessions
        where article_id = articles.id
          and user_id = articles.user_id
          and superseded_by_session_id is null
        order by
          case when status in ('queued', 'running') then 0 else 1 end,
          updated_at desc
        limit 1
      ) ai_summary_session on true
      ${whereSql}
      ${whereSql ? 'and' : 'where'} ${ACTIVE_FEVER_ARTICLE_SQL}
      order by "sortPublishedAt" desc, articles.id desc
      limit $${limitParamIndex}
    `,
    queryParams,
  );

  return rows;
}

async function queryArticleTotalCount(
  pool: Pool,
  input: { view: string; unreadOnly?: boolean; includeFiltered?: boolean; userId?: string },
): Promise<number> {
  const { whereSql, params } = buildArticleFilter({
    view: input.view,
    unreadOnly: input.unreadOnly,
    includeFiltered: input.includeFiltered,
    userId: input.userId,
  });

  const { rows } = await pool.query<{ totalCount: number }>(
    `
      select count(*)::int as "totalCount"
      from articles
      ${whereSql}
      ${whereSql ? 'and' : 'where'} ${ACTIVE_FEVER_ARTICLE_SQL}
    `,
    params,
  );

  return rows[0]?.totalCount ?? 0;
}
export async function getReaderSnapshot(
  pool: Pool,
  input: {
    view: string;
    limit?: number;
    cursor?: string | null;
    unreadOnly?: boolean;
    includeFiltered?: boolean;
    userId?: string;
  },
): Promise<ReaderSnapshot> {
  const userId = input.userId ?? '1';
  const [categories, feeds] = await Promise.all([
    listCategories(pool, userId),
    listFeeds(pool, userId),
  ]);

  const { rows: unreadRows } = await pool.query<{
    feedId: string;
    unreadCount: number;
  }>(`
    select feed_id as "feedId", count(*)::int as "unreadCount"
    from articles
    where user_id = $1
      and is_read = false
      and filter_status = any('{passed,error}'::text[])
      and ${ACTIVE_FEVER_ARTICLE_SQL}
    group by feed_id
  `, [userId]);

  const unreadByFeedId = new Map<string, number>();
  for (const row of unreadRows) {
    unreadByFeedId.set(row.feedId, row.unreadCount);
  }

  const feedsWithUnread: ReaderSnapshotFeed[] = feeds.map((feed) => ({
    ...feed,
    remoteManaged: feed.provider === 'fever',
    remoteSource: feed.provider === 'fever' ? 'fever' : null,
    iconUrl: rewriteFeedIcon(feed.iconUrl),
    unreadCount: unreadByFeedId.get(feed.id) ?? 0,
  }));

  const { limit } = buildArticleFilter(input);
  const [queriedRows, totalCount] = await Promise.all([
    queryArticleRows(pool, {
      view: input.view,
      limit,
      cursor: input.cursor,
      unreadOnly: input.unreadOnly,
      includeFiltered: input.includeFiltered,
      userId,
    }),
    // The header count must reflect the full filtered result set, not the current page window.
    queryArticleTotalCount(pool, {
      view: input.view,
      unreadOnly: input.unreadOnly,
      includeFiltered: input.includeFiltered,
      userId,
    }),
  ]);
  // 下一页使用严格小于比较，游标必须指向本页末条；额外一条只用于判断是否还有下一页。
  const nextCursor =
    queriedRows.length > limit
      ? encodeCursor({
          publishedAt: serializeCursorPublishedAt(queriedRows[limit - 1].sortPublishedAt),
          id: queriedRows[limit - 1].id,
        })
      : null;
  const rows = queriedRows.slice(0, limit);

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
          aiSummarySessionId,
          aiSummarySessionStatus,
          aiSummarySessionDraftText,
          aiSummarySessionFinalText,
          aiSummarySessionErrorCode,
          aiSummarySessionErrorMessage,
          aiSummarySessionRawErrorMessage,
          aiSummarySessionStartedAt,
          aiSummarySessionFinishedAt,
          aiSummarySessionUpdatedAt,
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
          summary: normalizeSnapshotSummary(rest.summary),
          previewImage: rewritePreviewImage(rest.previewImage),
          bodyTranslationEligible: eligibility.bodyTranslationEligible,
          bodyTranslationBlockedReason: eligibility.bodyTranslationBlockedReason,
          aiSummarySession:
            aiSummarySessionId &&
            aiSummarySessionStatus &&
            aiSummarySessionDraftText !== null &&
            aiSummarySessionStartedAt &&
            aiSummarySessionUpdatedAt
              ? {
                  id: aiSummarySessionId,
                  status: aiSummarySessionStatus,
                  draftText: aiSummarySessionDraftText,
                  finalText: aiSummarySessionFinalText,
                  errorCode: aiSummarySessionErrorCode,
                  errorMessage: aiSummarySessionErrorMessage,
                  rawErrorMessage: aiSummarySessionRawErrorMessage,
                  startedAt: aiSummarySessionStartedAt,
                  finishedAt: aiSummarySessionFinishedAt,
                  updatedAt: aiSummarySessionUpdatedAt,
                }
              : null,
        };
      }),
      nextCursor,
      totalCount,
    },
  };
}
