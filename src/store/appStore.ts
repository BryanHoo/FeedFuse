import { create } from 'zustand';
import type { Article, Category, Feed, ViewType } from '../types';
import { useSettingsStore } from './settingsStore';
import {
  createFeed,
  deleteFeed,
  getArticle,
  getReaderSnapshot,
  mapArticleDto,
  mapFeedDto,
  mapSnapshotArticleItem,
  markAllRead,
  patchFeed,
  patchArticle,
  refreshFeed,
} from '../lib/apiClient';

const READER_SELECTION_VIEW_PARAM = 'view';
const READER_SELECTION_ARTICLE_PARAM = 'article';

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

function persistReaderSelectionToUrl(selectedView: ViewType, selectedArticleId: string | null): void {
  if (typeof window === 'undefined') return;

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
    window.history.replaceState(window.history.state, '', nextUrl);
  } catch {
    // Ignore URL write errors in restricted browsing contexts.
  }
}

interface AppState {
  feeds: Feed[];
  categories: Category[];
  articles: Article[];
  selectedView: ViewType;
  selectedArticleId: string | null;
  sidebarCollapsed: boolean;
  showUnreadOnly: boolean;
  snapshotLoading: boolean;

  setSelectedView: (view: ViewType) => void;
  setSelectedArticle: (id: string | null) => void;
  toggleShowUnreadOnly: () => void;
  refreshArticle: (
    articleId: string,
  ) => Promise<{
    hasFulltext: boolean;
    hasFulltextError: boolean;
    hasAiSummary: boolean;
    hasAiTranslation: boolean;
  }>;
  loadSnapshot: (input?: { view?: ViewType }) => Promise<void>;
  toggleSidebar: () => void;
  markAsRead: (articleId: string) => void;
  markAllAsRead: (feedId?: string) => void;
  addFeed: (feed: {
    title: string;
    url: string;
    siteUrl?: string | null;
    categoryId: string | null;
    fullTextOnOpenEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    bodyTranslateEnabled?: boolean;
  }) => Promise<void>;
  updateFeed: (
    feedId: string,
    patch: {
      title?: string;
      url?: string;
      siteUrl?: string | null;
      enabled?: boolean;
      categoryId?: string | null;
      fullTextOnOpenEnabled?: boolean;
      aiSummaryOnOpenEnabled?: boolean;
      titleTranslateEnabled?: boolean;
      bodyTranslateEnabled?: boolean;
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

let snapshotRequestId = 0;
const ADD_FEED_SNAPSHOT_POLL_MAX_ATTEMPTS = 20;
const ADD_FEED_SNAPSHOT_POLL_INTERVAL_MS = 750;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const initialReaderSelection = readReaderSelectionFromUrl();

export const useAppStore = create<AppState>((set, get) => ({
  feeds: [],
  categories: [uncategorizedCategory],
  articles: [],
  selectedView: initialReaderSelection.selectedView,
  selectedArticleId: initialReaderSelection.selectedArticleId,
  sidebarCollapsed: false,
  showUnreadOnly: false,
  snapshotLoading: false,

  setSelectedView: (view) =>
    set(() => {
      const defaultUnreadOnlyInAll = useSettingsStore.getState().persistedSettings.general.defaultUnreadOnlyInAll;
      const showUnreadOnly = view !== 'unread' && view !== 'starred' ? defaultUnreadOnlyInAll : false;
      return { selectedView: view, selectedArticleId: null, showUnreadOnly };
    }),
  setSelectedArticle: (id) => {
    set({ selectedArticleId: id });

    if (!id) return;
    const article = get().articles.find((item) => item.id === id);
    if (article?.content) return;

    void (async () => {
      try {
        const dto = await getArticle(id);
        const mapped = mapArticleDto(dto);
        set((state) => {
          const existing = state.articles.find((item) => item.id === mapped.id);
          if (existing) {
            return {
              articles: state.articles.map((item) =>
                item.id === mapped.id ? { ...item, ...mapped } : item
              ),
            };
          }
          return { articles: [mapped, ...state.articles] };
        });
      } catch (err) {
        console.error(err);
      }
    })();
  },
  toggleShowUnreadOnly: () => set((state) => ({ showUnreadOnly: !state.showUnreadOnly })),
  refreshArticle: async (articleId) => {
    try {
      const dto = await getArticle(articleId);
      const hasFulltext = Boolean(dto.contentFullHtml);
      const hasFulltextError = Boolean(dto.contentFullError);
      const hasAiSummary = Boolean(dto.aiSummary?.trim());
      const hasAiTranslation = Boolean(
        dto.aiTranslationBilingualHtml?.trim() || dto.aiTranslationZhHtml?.trim(),
      );
      const mapped = mapArticleDto(dto);
      set((state) => {
        const existing = state.articles.find((item) => item.id === mapped.id);
        if (existing) {
          return {
            articles: state.articles.map((item) =>
              item.id === mapped.id ? { ...item, ...mapped } : item
            ),
          };
        }
        return { articles: [mapped, ...state.articles] };
      });
      return { hasFulltext, hasFulltextError, hasAiSummary, hasAiTranslation };
    } catch (err) {
      console.error(err);
      return { hasFulltext: false, hasFulltextError: false, hasAiSummary: false, hasAiTranslation: false };
    }
  },
  loadSnapshot: async (input) => {
    const requestId = snapshotRequestId + 1;
    snapshotRequestId = requestId;
    set({ snapshotLoading: true });

    try {
      const view = input?.view ?? get().selectedView;
      const snapshot = await getReaderSnapshot({ view });

      if (requestId !== snapshotRequestId) return;

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
        const articles = snapshot.articles.items.map(mapSnapshotArticleItem);

        return {
          categories,
          feeds,
          articles,
          snapshotLoading: false,
        };
      });

      const selectedArticleId = get().selectedArticleId;
      if (selectedArticleId) {
        const selectedArticle = get().articles.find((item) => item.id === selectedArticleId);
        if (!selectedArticle?.content) {
          get().setSelectedArticle(selectedArticleId);
        }
      }
    } catch (err) {
      console.error(err);
      if (requestId === snapshotRequestId) {
        set({ snapshotLoading: false });
      }
    }
  },
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  markAsRead: (articleId) => {
    const article = get().articles.find((item) => item.id === articleId);
    if (!article || article.isRead) return;

    set((state) => ({
      articles: state.articles.map((item) =>
        item.id === articleId ? { ...item, isRead: true } : item,
      ),
      feeds: state.feeds.map((feed) =>
        feed.id === article.feedId
          ? { ...feed, unreadCount: Math.max(0, feed.unreadCount - 1) }
          : feed,
      ),
    }));

    void patchArticle(articleId, { isRead: true }).catch((err) => console.error(err));
  },

  markAllAsRead: (feedId) => {
    set((state) => ({
      articles: state.articles.map((item) => {
        if (feedId && item.feedId !== feedId) return item;
        return item.isRead ? item : { ...item, isRead: true };
      }),
      feeds: state.feeds.map((feed) => {
        if (!feedId || feed.id === feedId) {
          return { ...feed, unreadCount: 0 };
        }
        return feed;
      }),
    }));

    void markAllRead(feedId ? { feedId } : {}).catch((err) => console.error(err));
  },

  addFeed: async (payload) => {
    const created = await createFeed(payload);
    const categories = get().categories;
    const mapped = mapFeedDto(created, categories);

    set((state) => ({
      feeds: state.feeds.some((item) => item.id === mapped.id)
        ? state.feeds
        : [...state.feeds, mapped],
      selectedView: mapped.id,
      selectedArticleId: null,
    }));

    try {
      await refreshFeed(created.id);

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

  updateFeed: async (feedId, patch) => {
    const updated = await patchFeed(feedId, patch);
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
            aiSummaryOnOpenEnabled: updated.aiSummaryOnOpenEnabled,
            titleTranslateEnabled: updated.titleTranslateEnabled,
            bodyTranslateEnabled: updated.bodyTranslateEnabled,
            articleListDisplayMode: updated.articleListDisplayMode,
            categoryId: updated.categoryId,
            category: updated.categoryId ? (categoryNameById.get(updated.categoryId) ?? null) : null,
          };
        }),
      };
    });
  },

  removeFeed: async (feedId) => {
    await deleteFeed(feedId);

    set((state) => {
      const nextSelectedView = state.selectedView === feedId ? 'all' : state.selectedView;
      const nextSelectedArticleId = state.selectedView === feedId ? null : state.selectedArticleId;

      return {
        feeds: state.feeds.filter((feed) => feed.id !== feedId),
        articles: state.articles.filter((article) => article.feedId !== feedId),
        selectedView: nextSelectedView,
        selectedArticleId: nextSelectedArticleId,
      };
    });
  },

  toggleStar: (articleId) => {
    const article = get().articles.find((item) => item.id === articleId);
    if (!article) return;
    const nextValue = !article.isStarred;

    set((state) => ({
      articles: state.articles.map((item) =>
        item.id === articleId ? { ...item, isStarred: nextValue } : item,
      ),
    }));

    void patchArticle(articleId, { isStarred: nextValue }).catch((err) => console.error(err));
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

if (typeof window !== 'undefined') {
  useAppStore.subscribe((state, previousState) => {
    if (
      state.selectedView === previousState.selectedView &&
      state.selectedArticleId === previousState.selectedArticleId
    ) {
      return;
    }

    persistReaderSelectionToUrl(state.selectedView, state.selectedArticleId);
  });
}
