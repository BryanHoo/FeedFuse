import { create } from 'zustand';
import type { Article, Category, Feed, ViewType } from '../types';
import { useSettingsStore } from './settingsStore';
import { AI_DIGEST_VIEW_ID, shouldUseDefaultUnreadOnly } from '../lib/view';
import {
  createAiDigest,
  createFeed,
  deleteFeed,
  getArticle,
  getAiDigestConfig as getAiDigestConfigRequest,
  getReaderSnapshot,
  mapArticleDto,
  mapFeedDto,
  mapSnapshotArticleItem,
  markAllRead,
  patchAiDigest as patchAiDigestRequest,
  patchFeed,
  patchArticle,
  refreshFeed,
} from '../lib/apiClient';
import {
  runImmediateFailure,
  runImmediateSuccess,
} from '../features/notifications/userOperationNotifier';

const READER_SELECTION_VIEW_PARAM = 'view';
const READER_SELECTION_ARTICLE_PARAM = 'article';
type ReaderSelectionHistoryMode = 'replace' | 'push' | 'none';

const DEFAULT_READER_SELECTION: { selectedView: ViewType; selectedArticleId: string | null } = {
  selectedView: 'all',
  selectedArticleId: null,
};

function readReaderSelectionFromUrl(): { selectedView: ViewType; selectedArticleId: string | null } {
  if (typeof window === 'undefined') return DEFAULT_READER_SELECTION;

  try {
    const params = new URLSearchParams(window.location.search);
    const selectedView = params.get(READER_SELECTION_VIEW_PARAM)?.trim() || 'all';
    const selectedArticleId = params.get(READER_SELECTION_ARTICLE_PARAM)?.trim() || null;

    return { selectedView, selectedArticleId };
  } catch {
    return DEFAULT_READER_SELECTION;
  }
}

function persistReaderSelectionToUrl(
  selectedView: ViewType,
  selectedArticleId: string | null,
  mode: ReaderSelectionHistoryMode,
): void {
  if (typeof window === 'undefined' || mode === 'none') return;

  try {
    const currentUrl = new URL(window.location.href);
    const nextParams = new URLSearchParams(currentUrl.search);

    const setOrDeleteParam = (key: string, value: string | null) => {
      if (value) {
        nextParams.set(key, value);
      } else {
        nextParams.delete(key);
      }
    };

    setOrDeleteParam(
      READER_SELECTION_VIEW_PARAM,
      selectedView && selectedView !== 'all' ? selectedView : null,
    );
    setOrDeleteParam(READER_SELECTION_ARTICLE_PARAM, selectedArticleId);

    const nextSearch = nextParams.toString();
    const nextUrl = `${currentUrl.pathname}${nextSearch ? `?${nextSearch}` : ''}${currentUrl.hash}`;
    const currentPathWithQueryAndHash = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl === currentPathWithQueryAndHash) return;
    if (mode === 'push') {
      window.history.pushState(window.history.state, '', nextUrl);
      return;
    }
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch {
    // Ignore URL write errors in restricted browsing contexts.
  }
}

interface AppState {
  feeds: Feed[];
  categories: Category[];
  articles: Article[];
  articleDetailCache: Record<string, Article>;
  articleSnapshotCache: Record<string, Article[]>;
  showFilteredByFeedId: Record<string, boolean>;
  selectedView: ViewType;
  selectedArticleId: string | null;
  sidebarCollapsed: boolean;
  showUnreadOnly: boolean;
  snapshotLoading: boolean;
  articleListNextCursor: string | null;
  articleListHasMore: boolean;
  articleListTotalCount: number;
  articleListInitialLoading: boolean;
  articleListLoadingMore: boolean;
  articleListLoadMoreError: boolean;

  setSelectedView: (view: ViewType, options?: { history?: ReaderSelectionHistoryMode }) => void;
  setSelectedArticle: (id: string | null, options?: { history?: ReaderSelectionHistoryMode }) => void;
  toggleShowUnreadOnly: () => void;
  toggleShowFilteredForFeed: (feedId: string) => void;
  refreshArticle: (
    articleId: string,
  ) => Promise<{
    hasFulltext: boolean;
    hasFulltextError: boolean;
    hasAiSummary: boolean;
    hasAiTranslation: boolean;
  }>;
  loadSnapshot: (input?: { view?: ViewType }) => Promise<void>;
  loadMoreSnapshot: () => Promise<void>;
  toggleSidebar: () => void;
  markAsRead: (articleId: string) => void;
  markAllAsRead: (feedId?: string) => void;
  addFeed: (feed: {
    title: string;
    url: string;
    siteUrl?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    fullTextOnOpenEnabled?: boolean;
    fullTextOnFetchEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    aiSummaryOnFetchEnabled?: boolean;
    bodyTranslateOnFetchEnabled?: boolean;
    bodyTranslateOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    bodyTranslateEnabled?: boolean;
  }) => Promise<void>;
  addAiDigest: (payload: {
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
  }) => Promise<void>;
  getAiDigestConfig: (feedId: string) => Promise<{
    feedId: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
  }>;
  updateAiDigest: (
    feedId: string,
    payload: {
      title: string;
      prompt: string;
      intervalMinutes: number;
      selectedFeedIds: string[];
      categoryId?: string | null;
      categoryName?: string | null;
    },
  ) => Promise<void>;
  updateFeed: (
    feedId: string,
    patch: {
      title?: string;
      url?: string;
      siteUrl?: string | null;
      enabled?: boolean;
      categoryId?: string | null;
      categoryName?: string | null;
      fullTextOnOpenEnabled?: boolean;
      fullTextOnFetchEnabled?: boolean;
      aiSummaryOnOpenEnabled?: boolean;
      aiSummaryOnFetchEnabled?: boolean;
      bodyTranslateOnFetchEnabled?: boolean;
      bodyTranslateOnOpenEnabled?: boolean;
      titleTranslateEnabled?: boolean;
      articleListDisplayMode?: 'card' | 'list';
    },
  ) => Promise<void>;
  removeFeed: (feedId: string) => Promise<void>;
  toggleStar: (articleId: string) => void;
  toggleCategory: (categoryId: string) => void;
  clearCategoryFromFeeds: (categoryId: string) => void;
}

const uncategorizedCategory: Category = {
  id: 'cat-uncategorized',
  name: '未分类',
  expanded: true,
};

function normalizeText(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function ensureUncategorizedCategory(categories: Category[], expandedById: Map<string, boolean>) {
  const existing = categories.find((item) => item.id === uncategorizedCategory.id);
  if (existing) return;

  categories.push({
    ...uncategorizedCategory,
    expanded: expandedById.get(uncategorizedCategory.id) ?? true,
  });
}

function findCategoryById(categories: Category[], id: string): Category | undefined {
  return categories.find((item) => item.id === id);
}

function findCategoryByName(categories: Category[], name: string): Category | undefined {
  return categories.find((item) => item.name === name);
}

function findCategoryByNameCaseInsensitive(categories: Category[], name: string): Category | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return categories.find((item) => item.name.trim().toLowerCase() === key);
}

function resolveCategoryTarget(categories: Category[], input: string): Category | undefined {
  const normalized = normalizeText(input);
  if (!normalized) return undefined;

  return (
    findCategoryById(categories, normalized) ??
    findCategoryByName(categories, normalized) ??
    findCategoryByNameCaseInsensitive(categories, normalized)
  );
}

function hasArticleDetails(article?: Article): boolean {
  return Boolean(
    article?.content ||
      article?.aiSummary ||
      article?.aiSummarySession !== undefined ||
      article?.aiTranslationZhHtml ||
      article?.aiTranslationBilingualHtml ||
      article?.aiDigestSources?.length,
  );
}

function pickDetailedArticle(existingArticle?: Article, cachedArticle?: Article): Article | undefined {
  if (hasArticleDetails(existingArticle)) {
    return existingArticle;
  }

  if (hasArticleDetails(cachedArticle)) {
    return cachedArticle;
  }

  return existingArticle ?? cachedArticle;
}

function mergeSnapshotArticleWithExistingDetails(
  snapshotArticle: Article,
  existingArticle?: Article,
  cachedArticle?: Article,
): Article {
  const detailArticle = pickDetailedArticle(existingArticle, cachedArticle);
  if (!detailArticle) {
    return snapshotArticle;
  }

  const aiSummarySession =
    snapshotArticle.aiSummarySession !== undefined
      ? snapshotArticle.aiSummarySession
      : detailArticle.aiSummarySession;

  return {
    ...snapshotArticle,
    content: detailArticle.content,
    aiSummary: detailArticle.aiSummary,
    // Snapshot is authoritative here, including an explicit null that clears stale local session state.
    aiSummarySession,
    aiTranslationZhHtml: detailArticle.aiTranslationZhHtml,
    aiTranslationBilingualHtml: detailArticle.aiTranslationBilingualHtml,
    aiDigestSources: detailArticle.aiDigestSources,
  };
}

function getArticleFromCollections(
  articleId: string | null,
  articles: Article[],
  articleDetailCache: Record<string, Article>,
): Article | undefined {
  if (!articleId) {
    return undefined;
  }

  return articles.find((item) => item.id === articleId) ?? articleDetailCache[articleId];
}

function updateCachedArticle(
  articleDetailCache: Record<string, Article>,
  articleId: string,
  updater: (article: Article) => Article,
): Record<string, Article> {
  const cachedArticle = articleDetailCache[articleId];
  if (!cachedArticle) {
    return articleDetailCache;
  }

  return {
    ...articleDetailCache,
    [articleId]: updater(cachedArticle),
  };
}

export function getSelectedArticleFromState(
  state: Pick<AppState, 'selectedArticleId' | 'articles' | 'articleDetailCache'>,
): Article | null {
  return (
    getArticleFromCollections(
      state.selectedArticleId,
      state.articles,
      state.articleDetailCache,
    ) ?? null
  );
}

function mergeArticleIntoCollections(
  state: Pick<AppState, 'articles' | 'articleDetailCache'>,
  article: Article,
) {
  const existingArticle = state.articles.find((item) => item.id === article.id);

  return {
    articles: existingArticle
      ? state.articles.map((item) => (item.id === article.id ? { ...item, ...article } : item))
      : state.articles,
    articleDetailCache: {
      ...state.articleDetailCache,
      [article.id]: article,
    },
  };
}

let snapshotRequestId = 0;
const latestSnapshotRequestIdByView = new Map<string, number>();
const ADD_FEED_SNAPSHOT_POLL_MAX_ATTEMPTS = 20;
const ADD_FEED_SNAPSHOT_POLL_INTERVAL_MS = 750;
// Tracks how the next selected view/article URL sync should write browser history.
let pendingReaderSelectionHistoryMode: ReaderSelectionHistoryMode = 'replace';
const INITIAL_ARTICLE_LIST_SESSION = {
  articleListNextCursor: null as string | null,
  articleListHasMore: false,
  articleListTotalCount: 0,
  articleListInitialLoading: false,
  articleListLoadingMore: false,
  articleListLoadMoreError: false,
};

function queueReaderSelectionHistoryMode(mode: ReaderSelectionHistoryMode): void {
  pendingReaderSelectionHistoryMode = mode;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSnapshotRequestInput(
  state: Pick<AppState, 'selectedView' | 'showUnreadOnly' | 'showFilteredByFeedId'>,
  view: ViewType,
  input?: { cursor?: string },
) {
  const includeFiltered =
    typeof view === 'string' &&
    !['all', 'unread', 'starred'].includes(view) &&
    view !== AI_DIGEST_VIEW_ID &&
    Boolean(state.showFilteredByFeedId[view])
      ? true
      : undefined;

  return {
    view,
    cursor: input?.cursor,
    includeFiltered,
    unreadOnly: state.selectedView === view && state.showUnreadOnly ? true : undefined,
  };
}

function getSnapshotTotalCount(
  snapshot: Awaited<ReturnType<typeof getReaderSnapshot>>,
  fallbackCount: number,
): number {
  return typeof snapshot.articles.totalCount === 'number'
    ? snapshot.articles.totalCount
    : fallbackCount;
}

function mergeSnapshotPage(
  previous: Article[],
  incoming: Article[],
  articleDetailCache: Record<string, Article>,
) {
  const byId = new Map(previous.map((item) => [item.id, item]));

  for (const article of incoming) {
    // Keep expanded article details when a later snapshot page overlaps an existing row.
    byId.set(
      article.id,
      mergeSnapshotArticleWithExistingDetails(
        article,
        byId.get(article.id),
        articleDetailCache[article.id],
      ),
    );
  }

  return Array.from(byId.values());
}

const initialReaderSelection = readReaderSelectionFromUrl();

export const useAppStore = create<AppState>((set, get) => ({
  feeds: [],
  categories: [uncategorizedCategory],
  articles: [],
  // Keep article detail independent from paged list snapshots so the reader pane stays stable.
  articleDetailCache: {},
  articleSnapshotCache: {},
  showFilteredByFeedId: {},
  selectedView: initialReaderSelection.selectedView,
  selectedArticleId: initialReaderSelection.selectedArticleId,
  sidebarCollapsed: false,
  showUnreadOnly: false,
  snapshotLoading: false,
  ...INITIAL_ARTICLE_LIST_SESSION,

  setSelectedView: (view, options) => {
    queueReaderSelectionHistoryMode(options?.history ?? 'replace');
    set(() => {
      const defaultUnreadOnlyInAll = useSettingsStore.getState().persistedSettings.general.defaultUnreadOnlyInAll;
      const showUnreadOnly = shouldUseDefaultUnreadOnly(view) ? defaultUnreadOnlyInAll : false;
      const state = get();
      const articleSnapshotCache = {
        ...state.articleSnapshotCache,
        [state.selectedView]: state.articles,
      };

      return {
        selectedView: view,
        selectedArticleId: null,
        showUnreadOnly,
        articles: articleSnapshotCache[view] ?? [],
        articleSnapshotCache,
        ...INITIAL_ARTICLE_LIST_SESSION,
      };
    });
  },
  setSelectedArticle: (id, options) => {
    queueReaderSelectionHistoryMode(options?.history ?? (id ? 'push' : 'replace'));
    set((state) => {
      const currentArticle = getArticleFromCollections(
        id,
        state.articles,
        state.articleDetailCache,
      );

      if (!id || !currentArticle?.content) {
        return { selectedArticleId: id };
      }

      return {
        selectedArticleId: id,
        articleDetailCache: {
          ...state.articleDetailCache,
          [id]: currentArticle,
        },
      };
    });

    if (!id) return;
    const article = getArticleFromCollections(id, get().articles, get().articleDetailCache);
    if (article?.content) return;

    void (async () => {
      try {
        const dto = await getArticle(id, { notifyOnError: false });
        const mapped = mapArticleDto(dto);
        set((state) => mergeArticleIntoCollections(state, mapped));
      } catch (err) {
        console.error(err);
      }
    })();
  },
  toggleShowUnreadOnly: () => {
    set((state) => ({
      showUnreadOnly: !state.showUnreadOnly,
      ...INITIAL_ARTICLE_LIST_SESSION,
    }));

    const view = get().selectedView;
    if (!shouldUseDefaultUnreadOnly(view)) {
      return;
    }

    // Reload the current snapshot so pagination and server-side unread filtering stay in sync.
    void get().loadSnapshot({ view });
  },
  toggleShowFilteredForFeed: (feedId) =>
    set((state) => ({
      showFilteredByFeedId: {
        ...state.showFilteredByFeedId,
        [feedId]: !state.showFilteredByFeedId[feedId],
      },
    })),
  refreshArticle: async (articleId) => {
    try {
      const dto = await getArticle(articleId, { notifyOnError: false });
      const hasFulltext = Boolean(dto.contentFullHtml);
      const hasFulltextError = Boolean(dto.contentFullError);
      const hasAiSummary = Boolean(dto.aiSummary?.trim());
      const hasAiTranslation = Boolean(
        dto.aiTranslationBilingualHtml?.trim() || dto.aiTranslationZhHtml?.trim(),
      );
      const mapped = mapArticleDto(dto);
      set((state) => mergeArticleIntoCollections(state, mapped));
      return { hasFulltext, hasFulltextError, hasAiSummary, hasAiTranslation };
    } catch (err) {
      console.error(err);
      return { hasFulltext: false, hasFulltextError: false, hasAiSummary: false, hasAiTranslation: false };
    }
  },
  loadSnapshot: async (input) => {
    const view = input?.view ?? get().selectedView;
    const requestId = snapshotRequestId + 1;
    snapshotRequestId = requestId;
    latestSnapshotRequestIdByView.set(view, requestId);

    if (get().selectedView === view) {
      set({
        snapshotLoading: true,
        articleListInitialLoading: true,
        articleListLoadingMore: false,
        articleListLoadMoreError: false,
      });
    }

    try {
      const snapshot = await getReaderSnapshot(
        buildSnapshotRequestInput(get(), view),
        { notifyOnError: false },
      );

      if (latestSnapshotRequestIdByView.get(view) !== requestId) return;

      set((state) => {
        const expandedById = new Map(
          state.categories.map((category) => [category.id, category.expanded ?? true]),
        );

        const categories: Category[] = snapshot.categories.map((item) => ({
          id: item.id,
          name: item.name,
          expanded: expandedById.get(item.id) ?? true,
        }));
        ensureUncategorizedCategory(categories, expandedById);

        const feeds = snapshot.feeds.map((feed) => mapFeedDto(feed, categories));
        const isVisibleView = state.selectedView === view;
        const existingArticles =
          (isVisibleView ? state.articles : state.articleSnapshotCache[view]) ?? [];
        const preservedSelectedArticle = isVisibleView
          ? getArticleFromCollections(
              state.selectedArticleId,
              existingArticles,
              state.articleDetailCache,
            )
          : undefined;
        const articleDetailCache =
          isVisibleView && preservedSelectedArticle?.content
            ? {
                ...state.articleDetailCache,
                [preservedSelectedArticle.id]: preservedSelectedArticle,
              }
            : state.articleDetailCache;
        const existingArticleById = new Map(
          existingArticles.map((article) => [article.id, article]),
        );
        const articles = snapshot.articles.items.map((item) =>
          mergeSnapshotArticleWithExistingDetails(
            mapSnapshotArticleItem(item),
            existingArticleById.get(item.id),
            articleDetailCache[item.id],
          ),
        );
        const articleSnapshotCache = {
          ...state.articleSnapshotCache,
          [view]: articles,
        };
        const nextCursor = snapshot.articles.nextCursor ?? null;
        const totalCount = getSnapshotTotalCount(snapshot, articles.length);

        return {
          categories,
          feeds,
          articles: isVisibleView ? articles : state.articles,
          articleDetailCache,
          articleSnapshotCache,
          snapshotLoading: isVisibleView ? false : state.snapshotLoading,
          articleListNextCursor: isVisibleView ? nextCursor : state.articleListNextCursor,
          articleListHasMore: isVisibleView ? nextCursor !== null : state.articleListHasMore,
          articleListTotalCount: isVisibleView ? totalCount : state.articleListTotalCount,
          articleListInitialLoading: isVisibleView ? false : state.articleListInitialLoading,
          articleListLoadingMore: isVisibleView ? false : state.articleListLoadingMore,
          articleListLoadMoreError: isVisibleView ? false : state.articleListLoadMoreError,
        };
      });

      if (get().selectedView !== view) return;
      const selectedArticleId = get().selectedArticleId;
      if (selectedArticleId) {
        const { articles, articleDetailCache } = get();
        const selectedArticle = getArticleFromCollections(
          selectedArticleId,
          articles,
          articleDetailCache,
        );
        if (!selectedArticle?.content) {
          get().setSelectedArticle(selectedArticleId, { history: 'none' });
        }
      }
    } catch (err) {
      console.error(err);
      if (
        latestSnapshotRequestIdByView.get(view) === requestId &&
        get().selectedView === view
      ) {
        set({
          snapshotLoading: false,
          articleListInitialLoading: false,
        });
      }
    }
  },
  loadMoreSnapshot: async () => {
    const state = get();
    const view = state.selectedView;
    const cursor = state.articleListNextCursor;

    if (!cursor || !state.articleListHasMore || state.articleListLoadingMore) {
      return;
    }

    const requestId = snapshotRequestId + 1;
    snapshotRequestId = requestId;
    latestSnapshotRequestIdByView.set(view, requestId);
    set({ articleListLoadingMore: true, articleListLoadMoreError: false });

    try {
      const snapshot = await getReaderSnapshot(
        buildSnapshotRequestInput(get(), view, { cursor }),
        { notifyOnError: false },
      );

      if (latestSnapshotRequestIdByView.get(view) !== requestId) return;
      if (get().selectedView !== view) return;

      set((currentState) => {
        if (currentState.selectedView !== view) return {};

        const incomingArticles = snapshot.articles.items.map((item) =>
          mapSnapshotArticleItem(item),
        );
        const articles = mergeSnapshotPage(
          currentState.articles,
          incomingArticles,
          currentState.articleDetailCache,
        );
        const nextCursor = snapshot.articles.nextCursor ?? null;

        return {
          articles,
          articleSnapshotCache: {
            ...currentState.articleSnapshotCache,
            [view]: articles,
          },
          articleListNextCursor: nextCursor,
          articleListHasMore: nextCursor !== null,
          articleListTotalCount: getSnapshotTotalCount(snapshot, currentState.articleListTotalCount),
          articleListLoadingMore: false,
          articleListLoadMoreError: false,
        };
      });
    } catch (err) {
      console.error(err);
      if (latestSnapshotRequestIdByView.get(view) === requestId && get().selectedView === view) {
        set({
          articleListLoadingMore: false,
          articleListLoadMoreError: true,
        });
      }
    }
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  markAsRead: (articleId) => {
    const article = getArticleFromCollections(articleId, get().articles, get().articleDetailCache);
    if (!article || article.isRead) return;

    set((state) => ({
      articles: state.articles.map((item) =>
        item.id === articleId ? { ...item, isRead: true } : item,
      ),
      articleDetailCache: updateCachedArticle(state.articleDetailCache, articleId, (cachedArticle) => ({
        ...cachedArticle,
        isRead: true,
      })),
      feeds: state.feeds.map((feed) =>
        feed.id === article.feedId
          ? { ...feed, unreadCount: Math.max(0, feed.unreadCount - 1) }
          : feed,
      ),
    }));

    void patchArticle(articleId, { isRead: true }, { notifyOnError: false })
      .then(() => {
        runImmediateSuccess({ actionKey: 'article.markRead' });
      })
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.markRead', err });
      });
  },

  markAllAsRead: (feedId) => {
    set((state) => ({
      articles: state.articles.map((item) => {
        if (feedId && item.feedId !== feedId) return item;
        return item.isRead ? item : { ...item, isRead: true };
      }),
      articleDetailCache: Object.fromEntries(
        Object.entries(state.articleDetailCache).map(([id, article]) => {
          if (feedId && article.feedId !== feedId) {
            return [id, article];
          }

          return [id, article.isRead ? article : { ...article, isRead: true }];
        }),
      ),
      feeds: state.feeds.map((feed) => {
        if (!feedId || feed.id === feedId) {
          return { ...feed, unreadCount: 0 };
        }
        return feed;
      }),
    }));

    void markAllRead(feedId ? { feedId } : {}, { notifyOnError: false })
      .then(() => {
        runImmediateSuccess({ actionKey: 'article.markAllRead' });
      })
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.markAllRead', err });
      });
  },

  addFeed: async (payload) => {
    const created = await createFeed(payload, { notifyOnError: false });
    const categories = get().categories;
    const mapped = mapFeedDto(created, categories);

    set((state) => ({
      feeds: state.feeds.some((item) => item.id === mapped.id)
        ? state.feeds
        : [...state.feeds, mapped],
      selectedView: mapped.id,
      selectedArticleId: null,
      ...INITIAL_ARTICLE_LIST_SESSION,
    }));

    try {
      await refreshFeed(created.id, { notifyOnError: false });

      for (let attempt = 0; attempt < ADD_FEED_SNAPSHOT_POLL_MAX_ATTEMPTS; attempt += 1) {
        if (get().selectedView !== created.id) return;

        if (attempt > 0) {
          await sleep(ADD_FEED_SNAPSHOT_POLL_INTERVAL_MS);
          if (get().selectedView !== created.id) return;
        }

        await get().loadSnapshot({ view: created.id });

        if (get().selectedView !== created.id) return;

        const hasFeedArticles = get().articles.some((article) => article.feedId === created.id);
        if (hasFeedArticles) return;
      }
    } catch (err) {
      console.error(err);
    }
  },

  addAiDigest: async (payload) => {
    const created = await createAiDigest(payload, { notifyOnError: false });
    const categories = get().categories;
    const mapped = mapFeedDto(created, categories);

    set((state) => ({
      feeds: state.feeds.some((item) => item.id === mapped.id) ? state.feeds : [...state.feeds, mapped],
      selectedView: mapped.id,
      selectedArticleId: null,
      ...INITIAL_ARTICLE_LIST_SESSION,
    }));

    // AI digest feed creation should not trigger RSS refresh; it only needs a snapshot reload.
    try {
      await get().loadSnapshot({ view: mapped.id });
    } catch (err) {
      console.error(err);
    }
  },

  getAiDigestConfig: async (feedId) => getAiDigestConfigRequest(feedId),

  updateAiDigest: async (feedId, payload) => {
    const updated = await patchAiDigestRequest(feedId, payload, {
      notifyOnError: false,
    });
    set((state) => {
      const categoryNameById = new Map(state.categories.map((category) => [category.id, category.name]));

      return {
        feeds: state.feeds.map((feed) => {
          if (feed.id !== feedId) return feed;

          return {
            ...feed,
            title: updated.title,
            url: updated.url,
            siteUrl: updated.siteUrl,
            icon: updated.iconUrl ?? undefined,
            enabled: updated.enabled,
            fullTextOnOpenEnabled: updated.fullTextOnOpenEnabled,
            fullTextOnFetchEnabled: updated.fullTextOnFetchEnabled,
            aiSummaryOnOpenEnabled: updated.aiSummaryOnOpenEnabled,
            aiSummaryOnFetchEnabled: updated.aiSummaryOnFetchEnabled,
            bodyTranslateOnFetchEnabled: updated.bodyTranslateOnFetchEnabled,
            bodyTranslateOnOpenEnabled: updated.bodyTranslateOnOpenEnabled,
            titleTranslateEnabled: updated.titleTranslateEnabled,
            bodyTranslateEnabled: updated.bodyTranslateEnabled,
            articleListDisplayMode: updated.articleListDisplayMode,
            categoryId: updated.categoryId,
            category: updated.categoryId ? (categoryNameById.get(updated.categoryId) ?? null) : null,
          };
        }),
      };
    });

    try {
      await get().loadSnapshot({ view: get().selectedView });
    } catch (err) {
      console.error(err);
    }
  },

  updateFeed: async (feedId, patch) => {
    const updated = await patchFeed(feedId, patch, { notifyOnError: false });
    set((state) => {
      const categoryNameById = new Map(state.categories.map((category) => [category.id, category.name]));

      return {
        feeds: state.feeds.map((feed) => {
          if (feed.id !== feedId) return feed;

          return {
            ...feed,
            title: updated.title,
            url: updated.url,
            siteUrl: updated.siteUrl,
            icon: updated.iconUrl ?? undefined,
            enabled: updated.enabled,
            fullTextOnOpenEnabled: updated.fullTextOnOpenEnabled,
            fullTextOnFetchEnabled: updated.fullTextOnFetchEnabled,
            aiSummaryOnOpenEnabled: updated.aiSummaryOnOpenEnabled,
            aiSummaryOnFetchEnabled: updated.aiSummaryOnFetchEnabled,
            bodyTranslateOnFetchEnabled: updated.bodyTranslateOnFetchEnabled,
            bodyTranslateOnOpenEnabled: updated.bodyTranslateOnOpenEnabled,
            titleTranslateEnabled: updated.titleTranslateEnabled,
            bodyTranslateEnabled: updated.bodyTranslateEnabled,
            articleListDisplayMode: updated.articleListDisplayMode,
            categoryId: updated.categoryId,
            category: updated.categoryId ? (categoryNameById.get(updated.categoryId) ?? null) : null,
          };
        }),
      };
    });

    try {
      await get().loadSnapshot({ view: get().selectedView });
    } catch (err) {
      console.error(err);
    }
  },

  removeFeed: async (feedId) => {
    await deleteFeed(feedId, { notifyOnError: false });

    let nextSelectedView: ViewType = get().selectedView;
    set((state) => {
      nextSelectedView = state.selectedView === feedId ? 'all' : state.selectedView;
      const nextSelectedArticleId = state.selectedView === feedId ? null : state.selectedArticleId;

      return {
        feeds: state.feeds.filter((feed) => feed.id !== feedId),
        articles: state.articles.filter((article) => article.feedId !== feedId),
        articleDetailCache: Object.fromEntries(
          Object.entries(state.articleDetailCache).filter(([, article]) => article.feedId !== feedId),
        ),
        selectedView: nextSelectedView,
        selectedArticleId: nextSelectedArticleId,
        ...INITIAL_ARTICLE_LIST_SESSION,
      };
    });

    try {
      await get().loadSnapshot({ view: nextSelectedView });
    } catch (err) {
      console.error(err);
    }
  },

  toggleStar: (articleId) => {
    const article = getArticleFromCollections(articleId, get().articles, get().articleDetailCache);
    if (!article) return;
    const nextValue = !article.isStarred;

    set((state) => ({
      articles: state.articles.map((item) =>
        item.id === articleId ? { ...item, isStarred: nextValue } : item,
      ),
      articleDetailCache: updateCachedArticle(state.articleDetailCache, articleId, (cachedArticle) => ({
        ...cachedArticle,
        isStarred: nextValue,
      })),
    }));

    void patchArticle(articleId, { isStarred: nextValue }, { notifyOnError: false })
      .then(() => {
        runImmediateSuccess({
          actionKey: 'article.toggleStar',
          context: { starred: nextValue },
        });
      })
      .catch((err) => {
        runImmediateFailure({
          actionKey: 'article.toggleStar',
          context: { starred: nextValue },
          err,
        });
      });
  },

  toggleCategory: (categoryId) =>
    set((state) => {
      const category = resolveCategoryTarget(state.categories, categoryId);
      if (!category) return {};

      return {
        categories: state.categories.map((item) =>
          item.id === category.id ? { ...item, expanded: !(item.expanded ?? true) } : item,
        ),
      };
    }),

  clearCategoryFromFeeds: (categoryId) =>
    set((state) => ({
      feeds: state.feeds.map((feed) =>
        feed.categoryId === categoryId
          ? {
              ...feed,
              categoryId: null,
              category: null,
            }
          : feed
      ),
    })),
}));

async function restoreReaderSelectionFromUrl(): Promise<void> {
  const { selectedView, selectedArticleId } = readReaderSelectionFromUrl();
  const store = useAppStore.getState();

  store.setSelectedView(selectedView, { history: 'none' });
  await store.loadSnapshot({ view: selectedView });
  store.setSelectedArticle(selectedArticleId, { history: 'none' });
}

if (typeof window !== 'undefined') {
  const onPopState = () => {
    void restoreReaderSelectionFromUrl().catch((err) => {
      console.error(err);
    });
  };

  window.addEventListener('popstate', onPopState);

  useAppStore.subscribe((state, previousState) => {
    if (
      state.selectedView === previousState.selectedView &&
      state.selectedArticleId === previousState.selectedArticleId
    ) {
      pendingReaderSelectionHistoryMode = 'replace';
      return;
    }

    const mode = pendingReaderSelectionHistoryMode;
    pendingReaderSelectionHistoryMode = 'replace';
    persistReaderSelectionToUrl(state.selectedView, state.selectedArticleId, mode);
  });
}
