import { useBatchReadStore } from '@/features/articles/batchReadStore';
import { create } from 'zustand';
import type { Article, Category, Feed, ViewType } from '../types';
import { useSettingsStore } from './settingsStore';
import { AI_DIGEST_VIEW_ID, shouldUseDefaultUnreadOnly } from '@/lib/reader/view';
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
} from '@/lib/api/apiClient';
import {
  runImmediateFailure,
  runImmediateSuccess,
} from '../features/notifications/userOperationNotifier';
import { AUTH_ANONYMOUS_STORAGE_USER_ID, getCurrentStorageUserId } from './authStore';

const READER_SELECTION_VIEW_PARAM = 'view';
const READER_SELECTION_ARTICLE_PARAM = 'article';
const READER_UNREAD_ONLY_BY_VIEW_STORAGE_KEY = 'feedfuse.reader.unreadOnlyByView.v1';
type ReaderSelectionHistoryMode = 'replace' | 'push' | 'none';
type FeedUpdateOptions = {
  syncInBackground?: boolean;
  refreshAfterSave?: boolean;
};

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

function readUnreadOnlyByViewFromStorage(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};

  try {
    const userId = getCurrentStorageUserId();
    const raw =
      window.localStorage.getItem(resolveUnreadOnlyStorageKey()) ??
      // 默认管理员继承旧单用户缓存；其他用户必须使用自己的命名空间。
      (userId === AUTH_ANONYMOUS_STORAGE_USER_ID || userId === '1'
        ? window.localStorage.getItem(READER_UNREAD_ONLY_BY_VIEW_STORAGE_KEY)
        : null);
    if (!raw) return {};

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => {
        const [view, value] = entry;
        return typeof view === 'string' && view.trim().length > 0 && typeof value === 'boolean';
      }),
    );
  } catch {
    return {};
  }
}

function persistUnreadOnlyByViewToStorage(unreadOnlyByView: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      resolveUnreadOnlyStorageKey(),
      JSON.stringify(unreadOnlyByView),
    );
  } catch {
    // 忽略隐私模式或受限浏览环境中的存储写入失败。
  }
}

function resolveUnreadOnlyStorageKey(): string {
  return `${READER_UNREAD_ONLY_BY_VIEW_STORAGE_KEY}:${getCurrentStorageUserId()}`;
}

function resolveUnreadOnlyForView(
  view: ViewType,
  unreadOnlyByView: Record<string, boolean>,
): boolean {
  if (!shouldUseDefaultUnreadOnly(view)) return false;
  const persisted = unreadOnlyByView[view];
  if (typeof persisted === 'boolean') return persisted;
  return useSettingsStore.getState().persistedSettings.general.defaultUnreadOnlyInAll;
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
  unreadOnlyByView: Record<string, boolean>;
  snapshotLoading: boolean;
  newArticlesAvailable: boolean;
  newArticlesLoading: boolean;
  articleListNextCursor: string | null;
  articleListHasMore: boolean;
  articleListTotalCount: number;
  articleListInitialLoading: boolean;
  articleListLoadingMore: boolean;
  articleListLoadMoreError: boolean;

  setSelectedView: (view: ViewType, options?: { history?: ReaderSelectionHistoryMode }) => void;
  setSelectedArticle: (id: string | null, options?: { history?: ReaderSelectionHistoryMode }) => void;
  openArticleInReader: (input: {
    view: ViewType;
    articleId: string;
    articleHistory?: ReaderSelectionHistoryMode;
  }) => Promise<void>;
  toggleShowUnreadOnly: () => void;
  rehydrateUserScopedLocalState: () => void;
  toggleShowFilteredForFeed: (feedId: string) => void;
  refreshArticle: (
    articleId: string,
  ) => Promise<{
    hasFulltext: boolean;
    hasFulltextError: boolean;
    hasAiSummary: boolean;
    hasAiTranslation: boolean;
  }>;
  checkForNewArticles: () => Promise<void>;
  loadSnapshot: (input?: { view?: ViewType; preserveArticles?: boolean }) => Promise<void>;
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
    options?: FeedUpdateOptions,
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

type ArticleFlag = 'isRead' | 'isStarred';
type ArticleCollections = Pick<AppState, 'articles' | 'articleDetailCache' | 'articleSnapshotCache'>;
type AppStateUpdater = (update: (state: AppState) => Partial<AppState>) => void;
type ArticleFlagOperation = {
  version: number;
  confirmed: boolean;
  desired: boolean;
  pending: boolean;
};

let articleMutationVersion = 0;
const articleWriteQueues = new Map<string, Promise<void>>();
const bulkReadWrites = new Set<Promise<void>>();
const articleFlagOperations = new Map<string, Partial<Record<ArticleFlag, ArticleFlagOperation>>>();

// 统一更新可见列表、详情与所有视图缓存；回滚只修改目标字段，保留正文及其他操作结果。
function updateArticleCollections(
  state: ArticleCollections,
  updater: (article: Article) => Article,
): ArticleCollections {
  return {
    articles: state.articles.map(updater),
    articleDetailCache: Object.fromEntries(
      Object.entries(state.articleDetailCache).map(([id, article]) => [id, updater(article)]),
    ),
    articleSnapshotCache: Object.fromEntries(
      Object.entries(state.articleSnapshotCache).map(([view, articles]) => [view, articles.map(updater)]),
    ),
  };
}

function updateArticleFlag(
  state: AppState,
  articleId: string,
  flag: ArticleFlag,
  value: boolean,
  unreadCountDelta?: number,
) {
  const article = getArticleFromCollections(articleId, state.articles, state.articleDetailCache)
    ?? Object.values(state.articleSnapshotCache).flat().find((item) => item.id === articleId);
  return {
    ...updateArticleCollections(state, (item) =>
      item.id === articleId ? { ...item, [flag]: value } : item,
    ),
    // 用当前字段的实际变化计算增量，避免失败恢复覆盖同一订阅源内其他文章的未读数。
    feeds: flag === 'isRead' && article && article.isRead !== value
      ? state.feeds.map((feed) => feed.id === article.feedId
        ? { ...feed, unreadCount: Math.max(0, feed.unreadCount + (unreadCountDelta ?? (value ? -1 : 1))) }
        : feed)
      : state.feeds,
  };
}

function writeArticleFlag(
  set: AppStateUpdater,
  article: Article,
  flag: ArticleFlag,
  desired: boolean,
): void {
  const operations = articleFlagOperations.get(article.id) ?? {};
  const previous = operations[flag];
  const operation: ArticleFlagOperation = {
    version: ++articleMutationVersion,
    confirmed: previous?.pending ? previous.confirmed : article[flag],
    desired,
    pending: true,
  };
  operations[flag] = operation;
  articleFlagOperations.set(article.id, operations);
  let unreadCountDelta = 0;
  set((state) => {
    const update = updateArticleFlag(state, article.id, flag, desired);
    // 记录实际扣减量；原计数为零时没有扣减，失败恢复也不能凭空增加未读数。
    unreadCountDelta = (update.feeds.find((feed) => feed.id === article.feedId)?.unreadCount ?? 0)
      - (state.feeds.find((feed) => feed.id === article.feedId)?.unreadCount ?? 0);
    return update;
  });

  const actionKey = flag === 'isRead' ? 'article.markRead' : 'article.toggleStar';
  const context = flag === 'isStarred' ? { starred: desired } : undefined;
  const predecessor = articleWriteQueues.get(article.id);
  // 同一文章的写入串行执行，不同文章互不阻塞；旧请求只更新确认值，不覆盖后续点击。
  const writing = (async () => {
    if (predecessor) await predecessor;
    try {
      await patchArticle(article.id, { [flag]: desired }, { notifyOnError: false });
      const latest = operations[flag]!;
      latest.confirmed = desired;
      latest.version = ++articleMutationVersion;
      if (latest !== operation) return;
      latest.pending = false;
      runImmediateSuccess({ actionKey, context });
    } catch (err) {
      const latest = operations[flag]!;
      if (latest !== operation) return;
      latest.pending = false;
      latest.desired = latest.confirmed;
      latest.version = ++articleMutationVersion;
      set((state) => updateArticleFlag(state, article.id, flag, latest.confirmed, -unreadCountDelta));
      runImmediateFailure({ actionKey, context, err });
    }
  })();
  articleWriteQueues.set(article.id, writing);
  void writing.then(() => {
    if (articleWriteQueues.get(article.id) === writing) articleWriteQueues.delete(article.id);
  });
}

// 快照同时包含文章状态和未读统计，须等待写入结束后读取，避免把旧统计叠加到乐观状态。
async function waitForArticleWrites(): Promise<void> {
  while (articleWriteQueues.size || bulkReadWrites.size) {
    await Promise.all([...articleWriteQueues.values(), ...bulkReadWrites]);
  }
}

function preserveNewerArticleFlags(article: Article, requestVersion: number): Article {
  const operations = articleFlagOperations.get(article.id);
  let result = article;
  for (const flag of ['isRead', 'isStarred'] as const) {
    const operation = operations?.[flag];
    // 详情请求仍可刷新正文，但不能用旧响应覆盖正在保存或请求发出之后产生的操作。
    if (operation && (operation.pending || operation.version > requestVersion)) {
      result = { ...result, [flag]: operation.desired };
    }
  }
  return result;
}

function synchronizeSnapshotFlags(state: ArticleCollections, articles: Article[]): ArticleCollections {
  const byId = new Map(articles.map((article) => [article.id, article]));
  return updateArticleCollections(state, (article) => {
    const incoming = byId.get(article.id);
    return incoming
      ? { ...article, isRead: incoming.isRead, isStarred: incoming.isStarred }
      : article;
  });
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
  state: Pick<AppState, 'articles' | 'articleDetailCache' | 'selectedView' | 'articleSnapshotCache'>,
  article: Article,
  requestVersion: number,
) {
  article = preserveNewerArticleFlags(article, requestVersion);
  state = { ...state, ...synchronizeSnapshotFlags(state, [article]) };
  const existingArticle = state.articles.find((item) => item.id === article.id);
  const cachedArticlesForFeed = state.articleSnapshotCache[article.feedId] ?? [];
  const existingCachedArticle = cachedArticlesForFeed.find((item) => item.id === article.id);
  const shouldRevealArticleInVisibleFeed =
    state.selectedView === article.feedId && !existingArticle;

  const nextVisibleArticles = existingArticle
    ? state.articles.map((item) => (item.id === article.id ? { ...item, ...article } : item))
    : shouldRevealArticleInVisibleFeed
      ? sortArticlesByPublishedAtDesc([...state.articles, article])
      : state.articles;

  const nextFeedSnapshotArticles = existingCachedArticle
    ? cachedArticlesForFeed.map((item) => (item.id === article.id ? { ...item, ...article } : item))
    : state.selectedView === article.feedId
      ? sortArticlesByPublishedAtDesc([...cachedArticlesForFeed, article])
      : cachedArticlesForFeed;
  const shouldWriteFeedSnapshotCache =
    existingCachedArticle !== undefined || state.selectedView === article.feedId;

  return {
    articles: nextVisibleArticles,
    articleDetailCache: {
      ...state.articleDetailCache,
      [article.id]: article,
    },
    articleSnapshotCache: shouldWriteFeedSnapshotCache
      ? {
          ...state.articleSnapshotCache,
          [article.feedId]: nextFeedSnapshotArticles,
        }
      : state.articleSnapshotCache,
  };
}

let snapshotRequestId = 0;
// 视图或筛选变化会开启新的阅读会话，旧检查即使返回同名视图也不能写入提示。
let readerSessionVersion = 0;
let newArticlesCheckInFlight = false;
const latestSnapshotRequestIdByView = new Map<string, number>();
const snapshotHeadBoundaryByView = new Map<string, { id: string; publishedAt: string | null }>();
const ADD_FEED_SNAPSHOT_POLL_MAX_ATTEMPTS = 20;
const ADD_FEED_SNAPSHOT_POLL_INTERVAL_MS = 750;
// Tracks how the next selected view/article URL sync should write browser history.
let pendingReaderSelectionHistoryMode: ReaderSelectionHistoryMode = 'replace';
const INITIAL_ARTICLE_LIST_SESSION = {
  newArticlesAvailable: false,
  newArticlesLoading: false,
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

async function runSilently(task: () => Promise<void>): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function pollFeedSnapshotUntilArticlesAppear(
  get: () => AppState,
  feedId: string,
): Promise<void> {
  for (let attempt = 0; attempt < ADD_FEED_SNAPSHOT_POLL_MAX_ATTEMPTS; attempt += 1) {
    if (get().selectedView !== feedId) return;

    if (attempt > 0) {
      await sleep(ADD_FEED_SNAPSHOT_POLL_INTERVAL_MS);
      if (get().selectedView !== feedId) return;
    }

    await get().loadSnapshot({ view: feedId });

    if (get().selectedView !== feedId) return;

    const hasFeedArticles = get().articles.some((article) => article.feedId === feedId);
    if (hasFeedArticles) return;
  }
}

async function loadCurrentSnapshotSilently(get: () => AppState): Promise<void> {
  await runSilently(async () => {
    await get().loadSnapshot({ view: get().selectedView });
  });
}

async function syncFeedInBackground(
  get: () => AppState,
  feedId: string,
  options: {
    reloadCurrentViewWhenUnselected: boolean;
  },
): Promise<void> {
  const didRefreshStart = await runSilently(async () => {
    await refreshFeed(feedId, { notifyOnError: false });
  });
  if (!didRefreshStart) return;

  if (get().selectedView === feedId) {
    await runSilently(async () => {
      await pollFeedSnapshotUntilArticlesAppear(get, feedId);
    });
    return;
  }

  if (options.reloadCurrentViewWhenUnselected) {
    await loadCurrentSnapshotSilently(get);
  }
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

function sortArticlesByPublishedAtDesc(articles: Article[]): Article[] {
  return articles
    .map((article, index) => {
      const publishedAtMs = Date.parse(article.publishedAt);

      return {
        article,
        index,
        publishedAtMs: Number.isNaN(publishedAtMs) ? Number.NEGATIVE_INFINITY : publishedAtMs,
      };
    })
    .sort((left, right) => {
      if (left.publishedAtMs !== right.publishedAtMs) {
        return right.publishedAtMs - left.publishedAtMs;
      }

      return left.index - right.index;
    })
    .map(({ article }) => article);
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

  return sortArticlesByPublishedAtDesc(Array.from(byId.values()));
}

function preserveSelectedArticleInVisibleSnapshot(
  articles: Article[],
  selectedArticle?: Article,
): Article[] {
  if (!selectedArticle || articles.some((article) => article.id === selectedArticle.id)) {
    return sortArticlesByPublishedAtDesc(articles);
  }

  // Keep the current selection visible without breaking the snapshot's chronological order.
  return sortArticlesByPublishedAtDesc([...articles, selectedArticle]);
}

const initialReaderSelection = readReaderSelectionFromUrl();
const initialUnreadOnlyByView = readUnreadOnlyByViewFromStorage();

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
  showUnreadOnly: resolveUnreadOnlyForView(initialReaderSelection.selectedView, initialUnreadOnlyByView),
  unreadOnlyByView: initialUnreadOnlyByView,
  snapshotLoading: false,
  ...INITIAL_ARTICLE_LIST_SESSION,

  setSelectedView: (view, options) => {
    readerSessionVersion += 1;
    queueReaderSelectionHistoryMode(options?.history ?? 'replace');
    set(() => {
      const state = get();
      const showUnreadOnly = resolveUnreadOnlyForView(view, state.unreadOnlyByView);
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
      const requestVersion = articleMutationVersion;
      try {
        const dto = await getArticle(id, { notifyOnError: false });
        const mapped = mapArticleDto(dto);
        set((state) => mergeArticleIntoCollections(state, mapped, requestVersion));
      } catch (err) {
        console.error(err);
      }
    })();
  },
  openArticleInReader: async ({ view, articleId, articleHistory = 'push' }) => {
    get().setSelectedView(view, { history: 'none' });
    await get().loadSnapshot({ view });
    get().setSelectedArticle(articleId, { history: articleHistory });
  },
  toggleShowUnreadOnly: () => {
    readerSessionVersion += 1;
    set((state) => {
      const nextShowUnreadOnly = !state.showUnreadOnly;
      const nextUnreadOnlyByView = shouldUseDefaultUnreadOnly(state.selectedView)
        ? {
            ...state.unreadOnlyByView,
            // 保存中栏按钮在当前选中项上的选择，优先级高于全局默认设置。
            [state.selectedView]: nextShowUnreadOnly,
          }
        : state.unreadOnlyByView;

      if (nextUnreadOnlyByView !== state.unreadOnlyByView) {
        persistUnreadOnlyByViewToStorage(nextUnreadOnlyByView);
      }

      return {
        showUnreadOnly: nextShowUnreadOnly,
        unreadOnlyByView: nextUnreadOnlyByView,
        ...INITIAL_ARTICLE_LIST_SESSION,
      };
    });

    const view = get().selectedView;
    if (!shouldUseDefaultUnreadOnly(view)) {
      return;
    }

    // Reload the current snapshot so pagination and server-side unread filtering stay in sync.
    void get().loadSnapshot({ view });
  },
  rehydrateUserScopedLocalState: () => {
    readerSessionVersion += 1;
    snapshotHeadBoundaryByView.clear();
    set((state) => {
      const unreadOnlyByView = readUnreadOnlyByViewFromStorage();
      return {
        unreadOnlyByView,
        showUnreadOnly: resolveUnreadOnlyForView(state.selectedView, unreadOnlyByView),
        newArticlesAvailable: false,
        newArticlesLoading: false,
      };
    });
  },
  toggleShowFilteredForFeed: (feedId) => {
    readerSessionVersion += 1;
    set((state) => ({
      newArticlesAvailable: false,
      showFilteredByFeedId: {
        ...state.showFilteredByFeedId,
        [feedId]: !state.showFilteredByFeedId[feedId],
      },
    }));
  },
  refreshArticle: async (articleId) => {
    const requestVersion = articleMutationVersion;
    try {
      const dto = await getArticle(articleId, { notifyOnError: false });
      const hasFulltext = Boolean(dto.contentFullHtml);
      const hasFulltextError = Boolean(dto.contentFullError);
      const hasAiSummary = Boolean(dto.aiSummary?.trim());
      const hasAiTranslation = Boolean(
        dto.aiTranslationBilingualHtml?.trim() || dto.aiTranslationZhHtml?.trim(),
      );
      const mapped = mapArticleDto(dto);
      set((state) => mergeArticleIntoCollections(state, mapped, requestVersion));
      return { hasFulltext, hasFulltextError, hasAiSummary, hasAiTranslation };
    } catch (err) {
      console.error(err);
      return { hasFulltext: false, hasFulltextError: false, hasAiSummary: false, hasAiTranslation: false };
    }
  },
  checkForNewArticles: async () => {
    const state = get();
    if (newArticlesCheckInFlight || state.snapshotLoading || state.newArticlesLoading || state.articleListLoadingMore) return;
    newArticlesCheckInFlight = true;
    const sessionVersion = readerSessionVersion;
    const userId = getCurrentStorageUserId();
    const view = state.selectedView;
    const requestId = snapshotRequestId;

    try {
      // 等待本地已读/收藏写入，避免将未读分页补位误判为后台新增。
      await waitForArticleWrites();
      if (sessionVersion !== readerSessionVersion || requestId !== snapshotRequestId) return;
      const requestVersion = articleMutationVersion;
      const snapshot = await getReaderSnapshot(buildSnapshotRequestInput(get(), view), { notifyOnError: false });
      if (
        sessionVersion !== readerSessionVersion || requestId !== snapshotRequestId ||
        requestVersion !== articleMutationVersion || userId !== getCurrentStorageUserId()
      ) return;

      const current = get();
      const knownIds = new Set(current.articles.map(article => article.id));
      const boundary = snapshotHeadBoundaryByView.get(view);
      const totalIncreased = getSnapshotTotalCount(snapshot, current.articleListTotalCount) > current.articleListTotalCount;
      // 发布日期较早的新入库文章可能不在首页，总数增长仍应让用户知道列表有更新。
      const newArticlesAvailable = totalIncreased || snapshot.articles.items.some(article => {
        if (knownIds.has(article.id)) return false;
        if (!boundary) return true;
        // 首页末尾之后的旧文章可能只是已读操作后的补位；同一发布时间按服务端 ID 倒序判定。
        const timeDifference = Date.parse(article.publishedAt ?? '1970-01-01') - Date.parse(boundary.publishedAt ?? '1970-01-01');
        if (timeDifference !== 0) return timeDifference > 0;
        return /^\d+$/.test(article.id) && /^\d+$/.test(boundary.id)
          ? BigInt(article.id) > BigInt(boundary.id)
          : article.id > boundary.id;
      });
      // 后台只更新提示，不覆盖列表、详情、分页或订阅统计，阅读位置因此保持稳定。
      set({ newArticlesAvailable });
    } catch {
      // 自动检查失败保留已有提示，下一次前台检查重试，不打断正在阅读的用户。
    } finally {
      newArticlesCheckInFlight = false;
    }
  },
  loadSnapshot: async (input) => {
    const view = input?.view ?? get().selectedView;
    const preserveArticles = input?.preserveArticles === true;
    if (preserveArticles && (get().newArticlesLoading || get().snapshotLoading)) return;
    const requestId = snapshotRequestId + 1;
    snapshotRequestId = requestId;
    latestSnapshotRequestIdByView.set(view, requestId);

    if (get().selectedView === view) {
      set(preserveArticles ? { newArticlesLoading: true, articleListLoadingMore: false } : {
        newArticlesLoading: false,
        snapshotLoading: true,
        articleListInitialLoading: true,
        articleListLoadingMore: false,
        articleListLoadMoreError: false,
      });
    }

    try {
      await waitForArticleWrites();
      if (latestSnapshotRequestIdByView.get(view) !== requestId) return;
      const requestVersion = articleMutationVersion;
      const snapshot = await getReaderSnapshot(
        buildSnapshotRequestInput(get(), view),
        { notifyOnError: false },
      );

      if (latestSnapshotRequestIdByView.get(view) !== requestId) return;
      // 请求期间发生了新操作，整份快照（含未读数）已过期，等待写入后重新读取。
      if (requestVersion !== articleMutationVersion) {
        if (preserveArticles) set({ newArticlesLoading: false });
        await get().loadSnapshot({ view, preserveArticles });
        return;
      }

      const headBoundary = snapshot.articles.items.at(-1);
      if (headBoundary) snapshotHeadBoundaryByView.set(view, headBoundary);
      else snapshotHeadBoundaryByView.delete(view);

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
        const incomingArticles = snapshot.articles.items.map((item) =>
          mergeSnapshotArticleWithExistingDetails(
            mapSnapshotArticleItem(item),
            existingArticleById.get(item.id),
            articleDetailCache[item.id],
          ),
        );
        // 手动接受新文章时保留已加载的旧分页，供虚拟列表继续以原来的文章作为滚动锚点。
        const articles = preserveSelectedArticleInVisibleSnapshot(
          preserveArticles ? mergeSnapshotPage(existingArticles, incomingArticles, articleDetailCache) : incomingArticles,
          isVisibleView ? preservedSelectedArticle : undefined,
        );
        const synchronized = synchronizeSnapshotFlags({ ...state, articleDetailCache }, articles);
        const articleSnapshotCache = {
          ...synchronized.articleSnapshotCache,
          [view]: articles,
        };
        const nextCursor = snapshot.articles.nextCursor ?? null;
        const totalCount = getSnapshotTotalCount(snapshot, articles.length);

        return {
          categories,
          feeds,
          articles: isVisibleView ? articles : synchronized.articles,
          articleDetailCache: synchronized.articleDetailCache,
          articleSnapshotCache,
          snapshotLoading: isVisibleView ? false : state.snapshotLoading,
          newArticlesAvailable: isVisibleView ? false : state.newArticlesAvailable,
          newArticlesLoading: isVisibleView ? false : state.newArticlesLoading,
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
          newArticlesLoading: false,
          articleListInitialLoading: false,
        });
      }
    }
  },
  loadMoreSnapshot: async () => {
    const state = get();
    const view = state.selectedView;
    const cursor = state.articleListNextCursor;

    if (!cursor || !state.articleListHasMore || state.articleListLoadingMore || state.newArticlesLoading) {
      return;
    }

    const requestId = snapshotRequestId + 1;
    snapshotRequestId = requestId;
    latestSnapshotRequestIdByView.set(view, requestId);
    set({ articleListLoadingMore: true, articleListLoadMoreError: false });

    try {
      await waitForArticleWrites();
      if (latestSnapshotRequestIdByView.get(view) !== requestId || get().selectedView !== view) return;
      const requestVersion = articleMutationVersion;
      const snapshot = await getReaderSnapshot(
        buildSnapshotRequestInput(get(), view, { cursor }),
        { notifyOnError: false },
      );

      if (latestSnapshotRequestIdByView.get(view) !== requestId) return;
      if (get().selectedView !== view) return;
      if (requestVersion !== articleMutationVersion) {
        set({ articleListLoadingMore: false });
        await get().loadMoreSnapshot();
        return;
      }

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
        const synchronized = synchronizeSnapshotFlags(currentState, incomingArticles);

        return {
          articles,
          articleDetailCache: synchronized.articleDetailCache,
          articleSnapshotCache: {
            ...synchronized.articleSnapshotCache,
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
    writeArticleFlag(set, article, 'isRead', true);
  },

  markAllAsRead: (feedId) => {
    // 后台任务只表示受理；逐项成功后的文章状态由进度轮询读取服务端快照。
    const userId = getCurrentStorageUserId();
    const writing = markAllRead(feedId ? { feedId } : {}, { notifyOnError: false })
      .then((result) => {
        if (getCurrentStorageUserId() !== userId) return;
        if (result.task) {
          ++articleMutationVersion;
          useBatchReadStore.getState().track(result.task, userId);
          return;
        }
        const version = ++articleMutationVersion;
        set((state) => ({
          ...updateArticleCollections(state, (article) => {
            if (feedId && article.feedId !== feedId) return article;
            if (state.feeds.find((feed) => feed.id === article.feedId)?.provider === 'fever') return article;
            const operations = articleFlagOperations.get(article.id) ?? {};
            if (operations.isRead?.pending) {
              // 单篇写入随后失败时也不能撤销已经成功的批量已读。
              operations.isRead.confirmed = true;
            } else {
              operations.isRead = { version, confirmed: true, desired: true, pending: false };
            }
            articleFlagOperations.set(article.id, operations);
            return article.isRead ? article : { ...article, isRead: true };
          }),
          feeds: state.feeds.map((feed) => (!feedId || feed.id === feedId) && feed.provider !== 'fever'
            ? { ...feed, unreadCount: 0 }
            : feed),
        }));
        runImmediateSuccess({ actionKey: 'article.markAllRead' });
      })
      .catch((err) => {
        runImmediateFailure({ actionKey: 'article.markAllRead', err });
      });
    bulkReadWrites.add(writing);
    void writing.then(() => bulkReadWrites.delete(writing));
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

    // 保存成功后先返回给 UI，后续拉取与快照轮询在后台完成，避免弹窗被刷新流程阻塞。
    void syncFeedInBackground(get, created.id, { reloadCurrentViewWhenUnselected: false });
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

  updateFeed: async (feedId, patch, options) => {
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

    if (options?.syncInBackground) {
      if (options.refreshAfterSave) {
        // RSS 编辑弹窗在关闭后再后台拉取，避免保存流程等待刷新完成。
        void syncFeedInBackground(get, feedId, { reloadCurrentViewWhenUnselected: true });
        return;
      }

      void loadCurrentSnapshotSilently(get);
      return;
    }

    try {
      if (options?.refreshAfterSave) {
        await refreshFeed(feedId, { notifyOnError: false });
      }

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
    writeArticleFlag(set, article, 'isStarred', !article.isStarred);
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
