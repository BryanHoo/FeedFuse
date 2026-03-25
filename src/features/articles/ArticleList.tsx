import { CheckCheck, CircleDot, LayoutGrid, List, RefreshCw } from "lucide-react";
import {
  type KeyboardEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAppStore } from "../../store/appStore";
import { formatRelativeTime } from "../../utils/date";
import {
  generateAiDigest,
  getAiDigestRunStatus,
  getFeedRefreshRunStatus,
  patchFeed,
  refreshAllFeeds,
  refreshFeed,
} from "../../lib/apiClient";
import { resolveArticleBriefContent } from "../../lib/articleSummary";
import { useRenderTimeSnapshot } from "../../hooks/useRenderTimeSnapshot";
import { READER_PANE_HOVER_BACKGROUND_CLASS_NAME } from "@/lib/designSystem";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  AI_DIGEST_VIEW_ID,
  isAggregateView as isAggregateReaderView,
  shouldUseDefaultUnreadOnly,
} from "@/lib/view";
import type { ViewType } from "../../types";
import ReaderToolbarIconButton from "../reader/ReaderToolbarIconButton";
import {
  beginDeferredOperation,
  failDeferredOperation,
  resolveDeferredOperation,
  runImmediateFailure,
  runImmediateOperation,
} from "../notifications/userOperationNotifier";
import { useHydratedSelectedView } from "../reader/useHydratedSelectedView";
import { buildArticleListDerivedState } from "./articleListModel";
import { getFilteredReasonLabel } from "./articleFilterReason";
import {
  getArticleVirtualAnchorCompensation,
  getArticleVirtualWindow,
} from "./articleVirtualWindow";

const sessionVisibleArticleIds = new Set<string>();
const REFRESH_POLL_INTERVAL_MS = 1000;
const REFRESH_POLL_MAX_ATTEMPTS = 12;
const AI_DIGEST_POLL_INTERVAL_MS = 1000;
const AI_DIGEST_POLL_MAX_ATTEMPTS = 30;

async function pollAiDigestRunStatus(input: {
  runId: string;
  isCurrentRequest: () => boolean;
}) {
  for (let attempt = 0; attempt < AI_DIGEST_POLL_MAX_ATTEMPTS; attempt += 1) {
    if (!input.isCurrentRequest()) {
      return null;
    }

    const run = await getAiDigestRunStatus(input.runId);
    if (!input.isCurrentRequest()) {
      return null;
    }

    if (run.status === 'succeeded' || run.status === 'skipped_no_updates') {
      return { ok: true as const };
    }

    if (run.status === 'failed') {
      return {
        ok: false as const,
        err: run.errorMessage ?? run.errorCode ?? '请稍后重试',
      };
    }

    if (attempt < AI_DIGEST_POLL_MAX_ATTEMPTS - 1) {
      await sleep(AI_DIGEST_POLL_INTERVAL_MS);
    }
  }

  return null;
}

async function pollFeedRefreshRunStatus(input: {
  runId: string;
  view: ViewType;
  loadSnapshot: (input?: { view?: ViewType }) => Promise<void>;
  isCurrentRequest: () => boolean;
}) {
  for (let attempt = 0; attempt < REFRESH_POLL_MAX_ATTEMPTS; attempt += 1) {
    if (!input.isCurrentRequest()) {
      return null;
    }

    const run = await getFeedRefreshRunStatus(input.runId);
    if (!input.isCurrentRequest()) {
      return null;
    }

    if (run.status === 'succeeded') {
      await input.loadSnapshot({ view: input.view }).catch((err) => {
        console.error(err);
      });
      return { ok: true as const };
    }

    if (run.status === 'failed') {
      return {
        ok: false as const,
        err: run.errorMessage ?? '请稍后重试',
      };
    }

    await input.loadSnapshot({ view: input.view }).catch((err) => {
      console.error(err);
    });
    if (!input.isCurrentRequest()) {
      return null;
    }

    if (attempt < REFRESH_POLL_MAX_ATTEMPTS - 1) {
      await sleep(REFRESH_POLL_INTERVAL_MS);
    }
  }

  return null;
}
const PREVIEW_PRELOAD_MAX_CONCURRENT = 2;
const VIRTUAL_OVERSCAN = 8;
const LOAD_MORE_THRESHOLD_PX = 320;
const LOAD_MORE_FOOTER_CLASS_NAME = "flex justify-center px-4 py-3 text-center";
const LOAD_MORE_HINT_CLASS_NAME = "text-xs text-muted-foreground";
type PreviewImageStatus = "loading" | "ready" | "failed";
const unreadSignalDotClassName =
  "h-2 w-2 rounded-full bg-[color-mix(in_oklab,var(--color-primary)_78%,white)] ring-2 ring-background/95";
const unreadSignalTimeClassName =
  "font-semibold text-[color-mix(in_oklab,var(--color-primary)_88%,white_12%)]";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function shouldShowFilteredBadge(input: { filterStatus?: string; isFiltered?: boolean }) {
  return input.isFiltered || input.filterStatus === "filtered";
}

interface ArticleListProps {
  renderedAt?: string;
  initialSelectedView?: ViewType;
}

export default function ArticleList({
  renderedAt,
  initialSelectedView,
}: ArticleListProps = {}) {
  const articles = useAppStore((state) => state.articles);
  const feeds = useAppStore((state) => state.feeds);
  const selectedView = useAppStore((state) => state.selectedView);
  const selectedArticleId = useAppStore((state) => state.selectedArticleId);
  const setSelectedArticle = useAppStore((state) => state.setSelectedArticle);
  const markAllAsRead = useAppStore((state) => state.markAllAsRead);
  const showUnreadOnly = useAppStore((state) => state.showUnreadOnly);
  const toggleShowUnreadOnly = useAppStore((state) => state.toggleShowUnreadOnly);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const loadMoreSnapshot = useAppStore((state) => state.loadMoreSnapshot);
  const articleListHasMore = useAppStore((state) => state.articleListHasMore);
  const articleListTotalCount = useAppStore((state) => state.articleListTotalCount);
  const articleListLoadingMore = useAppStore((state) => state.articleListLoadingMore);
  const articleListLoadMoreError = useAppStore((state) => state.articleListLoadMoreError);
  const refreshRequestIdRef = useRef(0);
  const displayModeRequestIdRef = useRef(0);
  const hasInitializedSelectedViewRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [displayModeSaving, setDisplayModeSaving] = useState(false);
  const renderedSelectedView = useHydratedSelectedView(selectedView, initialSelectedView);

  const showUnreadToggleAction = shouldUseDefaultUnreadOnly(renderedSelectedView);
  // Keep AI smart digest from exposing "mark all read" while allowing unread filter.
  const showMarkAllAsReadAction =
    showUnreadToggleAction && renderedSelectedView !== AI_DIGEST_VIEW_ID;
  const isAggregateView = isAggregateReaderView(renderedSelectedView);
  const selectedFeedFromStore = isAggregateView
    ? null
    : feeds.find((feed) => feed.id === renderedSelectedView) ?? null;
  const effectiveDisplayMode = isAggregateView
    ? "card"
    : (selectedFeedFromStore?.articleListDisplayMode ?? "card");

  const showUnreadFilterActive =
    renderedSelectedView === "unread" || (showUnreadOnly && showUnreadToggleAction);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const articleCardRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousVirtualRowsRef = useRef<Array<{ key: string; height: number }>>([]);
  const [previewImageStatuses, setPreviewImageStatuses] = useState<Map<string, PreviewImageStatus>>(
    () => new Map(),
  );
  const [activePreviewImageKeys, setActivePreviewImageKeys] = useState<Set<string>>(() => new Set());
  const preloadQueueRef = useRef<string[]>([]);
  const preloadInFlightRef = useRef(new Set<string>());
  const previewImageStatusesRef = useRef(previewImageStatuses);
  const cardTitleRefs = useRef(new Map<string, HTMLHeadingElement>());
  const [wrappedCardTitleArticleIds, setWrappedCardTitleArticleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const referenceTime = useRenderTimeSnapshot(renderedAt);

  useEffect(() => {
    if (!hasInitializedSelectedViewRef.current) {
      // Skip the initial selectedView effect so a click right after mount does not
      // invalidate the request id of the operation it just started.
      hasInitializedSelectedViewRef.current = true;
      return;
    }

    refreshRequestIdRef.current += 1;
    displayModeRequestIdRef.current += 1;
    setRefreshing(false);
    setDisplayModeSaving(false);
  }, [selectedView]);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previousState) => {
      const previousShowHeaderActions =
        shouldUseDefaultUnreadOnly(previousState.selectedView);
      const previousShowUnreadFilterActive =
        previousState.selectedView === "unread" ||
        (previousState.showUnreadOnly && previousShowHeaderActions);

      const currentShowHeaderActions =
        shouldUseDefaultUnreadOnly(state.selectedView);
      const currentShowUnreadFilterActive =
        state.selectedView === "unread" || (state.showUnreadOnly && currentShowHeaderActions);

      const selectedViewChanged = previousState.selectedView !== state.selectedView;
      const showUnreadOnlyChanged = previousState.showUnreadOnly !== state.showUnreadOnly;
      const unreadFilterDisabled =
        previousShowUnreadFilterActive && !currentShowUnreadFilterActive;
      const snapshotLoadingCompleted = previousState.snapshotLoading && !state.snapshotLoading;

      if (selectedViewChanged || showUnreadOnlyChanged || unreadFilterDisabled || snapshotLoadingCompleted) {
        sessionVisibleArticleIds.clear();
      }
    });

    return () => {
      sessionVisibleArticleIds.clear();
      unsubscribe();
    };
  }, []);

  const aiDigestFeedIds = useMemo(
    () =>
      new Set(
        feeds
          .filter((feed) => (feed.kind ?? "rss") === "ai_digest")
          .map((feed) => feed.id),
      ),
    [feeds],
  );

  const derivedState = useMemo(
    () =>
      buildArticleListDerivedState({
        articles,
        feeds,
        selectedView: renderedSelectedView,
        selectedArticleId,
        displayMode: effectiveDisplayMode,
        showUnreadFilterActive,
        retainedVisibleArticleIds: sessionVisibleArticleIds,
        aiDigestFeedIds,
        referenceTime,
      }),
    [
      aiDigestFeedIds,
      articles,
      effectiveDisplayMode,
      feeds,
      referenceTime,
      selectedArticleId,
      renderedSelectedView,
      showUnreadFilterActive,
    ],
  );
  const {
    articleSections,
    feedById,
    feedTitleById,
    filteredArticles,
    nextVisibleArticleIds,
    previewImageByArticleId,
    previewImageCandidates,
    unreadCount,
    virtualRows,
    viewScopedArticles,
  } = derivedState;
  const rowHeights = useMemo(() => virtualRows.map((row) => row.height), [virtualRows]);
  const effectiveViewportHeight = viewportHeight || scrollContainerRef.current?.clientHeight || 768;
  const virtualWindow = useMemo(
    () =>
      getArticleVirtualWindow({
        rowHeights,
        scrollTop,
        viewportHeight: effectiveViewportHeight,
        overscan: VIRTUAL_OVERSCAN,
      }),
    [effectiveViewportHeight, rowHeights, scrollTop],
  );
  const visibleRows = useMemo(() => {
    if (virtualWindow.endIndex < virtualWindow.startIndex) {
      return [];
    }

    return virtualRows.slice(virtualWindow.startIndex, virtualWindow.endIndex + 1);
  }, [virtualRows, virtualWindow]);

  useEffect(() => {
    if (!showUnreadFilterActive) {
      return;
    }

    if (areSetsEqual(sessionVisibleArticleIds, nextVisibleArticleIds)) {
      return;
    }

    sessionVisibleArticleIds.clear();
    for (const articleId of nextVisibleArticleIds) {
      sessionVisibleArticleIds.add(articleId);
    }
  }, [nextVisibleArticleIds, showUnreadFilterActive]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || previewImageByArticleId.size === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        setActivePreviewImageKeys((previous) => {
          const next = new Set(previous);

          for (const entry of entries) {
            if (!entry.isIntersecting) continue;

            const articleId = entry.target.getAttribute("data-article-id");
            const preview = articleId ? previewImageByArticleId.get(articleId) : undefined;
            if (preview) next.add(preview.key);
          }

          return areSetsEqual(previous, next) ? previous : next;
        });
      },
      {
        root,
        rootMargin: "0px 0px 50% 0px",
      },
    );

    for (const element of articleCardRefs.current.values()) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [previewImageByArticleId]);

  useEffect(() => {
    previousVirtualRowsRef.current = [];
    setScrollTop(0);
    setViewportHeight(0);
  }, [selectedView]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) {
      previousVirtualRowsRef.current = virtualRows.map((row) => ({ key: row.key, height: row.height }));
      return;
    }

    const nextRows = virtualRows.map((row) => ({ key: row.key, height: row.height }));
    const previousRows = previousVirtualRowsRef.current;

    if (previousRows.length > 0 && container.scrollTop > 0) {
      const nextScrollTop = getArticleVirtualAnchorCompensation({
        previousRows,
        nextRows,
        previousScrollTop: container.scrollTop,
      });

      if (nextScrollTop !== null && Math.abs(nextScrollTop - container.scrollTop) > 0.5) {
        // Keep the same anchor row under the viewport when refreshed data prepends new items.
        container.scrollTop = nextScrollTop;
        setScrollTop(nextScrollTop);
      }
    }

    previousVirtualRowsRef.current = nextRows;
    const nextViewportHeight = container.clientHeight;
    if (nextViewportHeight > 0 && nextViewportHeight !== viewportHeight) {
      setViewportHeight(nextViewportHeight);
    }
  }, [viewportHeight, virtualRows]);

  useEffect(() => {
    const candidateKeys = new Set(previewImageCandidates.keys());

    setPreviewImageStatuses((previousStatuses) => {
      let changed = false;
      const nextStatuses = new Map<string, PreviewImageStatus>();

      for (const [key, status] of previousStatuses) {
        if (!candidateKeys.has(key)) {
          changed = true;
          continue;
        }

        nextStatuses.set(key, status);
      }

      return changed ? nextStatuses : previousStatuses;
    });

    setActivePreviewImageKeys((previous) => {
      const next = new Set(Array.from(previous).filter((key) => candidateKeys.has(key)));
      return areSetsEqual(previous, next) ? previous : next;
    });

    preloadQueueRef.current = preloadQueueRef.current.filter((key) => candidateKeys.has(key));
    preloadInFlightRef.current.forEach((key) => {
      if (!candidateKeys.has(key)) preloadInFlightRef.current.delete(key);
    });
  }, [previewImageCandidates]);

  useEffect(() => {
    previewImageStatusesRef.current = previewImageStatuses;
  }, [previewImageStatuses]);

  const pumpPreviewPreloadQueue = useCallback(() => {
    while (
      preloadInFlightRef.current.size < PREVIEW_PRELOAD_MAX_CONCURRENT &&
      preloadQueueRef.current.length > 0
    ) {
      const key = preloadQueueRef.current.shift();
      if (!key) continue;

      const src = previewImageCandidates.get(key);
      if (!src || previewImageStatusesRef.current.has(key)) continue;

      preloadInFlightRef.current.add(key);
      setPreviewImageStatuses((previous) => new Map(previous).set(key, "loading"));

      const preloader = new Image();
      preloader.decoding = "async";
      preloader.fetchPriority = "low";
      preloader.onload = () => {
        preloadInFlightRef.current.delete(key);
        setPreviewImageStatuses((previous) => new Map(previous).set(key, "ready"));
        pumpPreviewPreloadQueue();
      };
      preloader.onerror = () => {
        preloadInFlightRef.current.delete(key);
        setPreviewImageStatuses((previous) => new Map(previous).set(key, "failed"));
        pumpPreviewPreloadQueue();
      };
      preloader.src = src;
    }
  }, [previewImageCandidates]);

  useEffect(() => {
    for (const key of activePreviewImageKeys) {
      const status = previewImageStatusesRef.current.get(key);
      if (status || preloadInFlightRef.current.has(key) || preloadQueueRef.current.includes(key)) continue;
      preloadQueueRef.current.push(key);
    }

    pumpPreviewPreloadQueue();
  }, [activePreviewImageKeys, pumpPreviewPreloadQueue]);

  const getFeedTitle = (feedId: string) => feedTitleById.get(feedId) ?? "";

  const handleMarkAllAsRead = () => {
    sessionVisibleArticleIds.clear();

    if (selectedView === "all") {
      markAllAsRead();
      return;
    }

    markAllAsRead(selectedView);
  };

  const articleCount =
    articleListTotalCount || (showUnreadFilterActive ? unreadCount : filteredArticles.length);

  const selectedFeed = isAggregateView ? null : feedById.get(renderedSelectedView) ?? selectedFeedFromStore;
  const headerTitle =
    renderedSelectedView === AI_DIGEST_VIEW_ID ? "智能解读" : (selectedFeed?.title ?? "文章");
  const isAiDigestView = Boolean(selectedFeed && (selectedFeed.kind ?? "rss") === "ai_digest");

  useEffect(() => {
    if (effectiveDisplayMode !== "card") {
      setWrappedCardTitleArticleIds((previousWrappedIds) =>
        previousWrappedIds.size === 0 ? previousWrappedIds : new Set(),
      );
      return;
    }

    const measureWrappedTitles = () => {
      const measuredWrappedIds = new Map<string, boolean>();

      for (const [articleId, titleElement] of cardTitleRefs.current) {
        const lineHeight = Number.parseFloat(window.getComputedStyle(titleElement).lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) continue;
        if (titleElement.clientHeight <= 0) continue;

        measuredWrappedIds.set(articleId, titleElement.clientHeight > lineHeight + 0.5);
      }

      const filteredArticleIds = new Set(filteredArticles.map((article) => article.id));

      setWrappedCardTitleArticleIds((previousWrappedIds) => {
        const nextWrappedIds = new Set<string>();

        // Preserve off-screen card measurements so virtualized unmounts do not reset summary clamping.
        for (const articleId of previousWrappedIds) {
          if (filteredArticleIds.has(articleId) && !measuredWrappedIds.has(articleId)) {
            nextWrappedIds.add(articleId);
          }
        }

        for (const [articleId, isWrapped] of measuredWrappedIds) {
          if (isWrapped) {
            nextWrappedIds.add(articleId);
            continue;
          }

          nextWrappedIds.delete(articleId);
        }

        return areSetsEqual(previousWrappedIds, nextWrappedIds) ? previousWrappedIds : nextWrappedIds;
      });
    };

    measureWrappedTitles();
    const rafId = window.requestAnimationFrame(measureWrappedTitles);
    window.addEventListener("resize", measureWrappedTitles);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measureWrappedTitles);
    };
    // Re-measure after preview images become visible because they shrink the text column width.
  }, [effectiveDisplayMode, filteredArticles, previewImageStatuses, visibleRows]);

  const canRefresh = (() => {
    if (refreshing) return false;
    if (isAggregateView) {
      return feeds.some((feed) => feed.enabled);
    }
    return Boolean(selectedFeed?.enabled);
  })();

  const emptyStateMessage = (() => {
    if (showUnreadFilterActive) {
      return selectedFeed ? "这个订阅源暂时没有未读文章" : "未读列表暂时是空的";
    }

    if (renderedSelectedView === "starred") {
      return "还没有收藏文章";
    }

    if (renderedSelectedView === AI_DIGEST_VIEW_ID) {
      return "还没有智能解读文章";
    }

    if (selectedFeed) {
      return canRefresh ? "这个订阅源还没有文章" : "这个订阅源还没有可显示的文章";
    }

    return "这里还没有文章";
  })();

  const getArticleButtonLabel = useCallback(
    (article: (typeof filteredArticles)[number], displayTitle: string) => {
      const labelParts = [displayTitle];
      const feedTitle = feedTitleById.get(article.feedId) ?? "";

      if (feedTitle) {
        labelParts.push(feedTitle);
      }

      labelParts.push(formatRelativeTime(article.publishedAt, referenceTime));
      if (shouldShowFilteredBadge(article)) {
        labelParts.push(getFilteredReasonLabel(article.filteredBy));
      }
      labelParts.push(article.isRead ? "已读" : "未读");

      return labelParts.join("，");
    },
    [feedTitleById, referenceTime],
  );

  const handleArticleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, articleId: string) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) {
        return;
      }

      const buttons = Array.from(
        container.querySelectorAll<HTMLButtonElement>('button[data-article-nav="true"]'),
      );

      if (buttons.length === 0) {
        return;
      }

      const currentIndex = buttons.findIndex((button) => button.dataset.articleId === articleId);
      if (currentIndex < 0) {
        return;
      }

      let nextIndex = currentIndex;

      if (event.key === "ArrowDown") {
        nextIndex = Math.min(currentIndex + 1, buttons.length - 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(currentIndex - 1, 0);
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = buttons.length - 1;
      }

      if (nextIndex === currentIndex) {
        return;
      }

      event.preventDefault();

      const nextButton = buttons[nextIndex];
      nextButton.focus();

      const nextArticleId = nextButton.dataset.articleId;
      if (nextArticleId) {
        setSelectedArticle(nextArticleId);
      }
    },
    [setSelectedArticle],
  );

  const refreshButtonTitle = isAggregateView
    ? "刷新全部订阅源"
    : isAiDigestView
      ? "立即生成"
      : "刷新订阅源";
  const displayModeButtonTitle = effectiveDisplayMode === "card" ? "切换为列表" : "切换为卡片";
  const unreadOnlyButtonLabel = showUnreadOnly ? "显示全部文章" : "仅显示未读文章";

  const maybeLoadMore = useCallback(
    (container: HTMLDivElement) => {
      if (!articleListHasMore || articleListLoadingMore || articleListLoadMoreError) {
        return;
      }

      const remainingDistance =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      if (remainingDistance <= LOAD_MORE_THRESHOLD_PX) {
        void loadMoreSnapshot();
      }
    },
    [articleListHasMore, articleListLoadMoreError, articleListLoadingMore, loadMoreSnapshot],
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const container = event.currentTarget;
      setScrollTop(container.scrollTop);
      setViewportHeight(container.clientHeight);
      maybeLoadMore(container);
    },
    [maybeLoadMore],
  );

  const renderLoadMoreFooter = () => {
    if (articleListLoadingMore) {
      return (
        <div className={LOAD_MORE_FOOTER_CLASS_NAME}>
          <p className={LOAD_MORE_HINT_CLASS_NAME}>正在为你加载更多内容...</p>
        </div>
      );
    }

    if (articleListLoadMoreError) {
      return (
        <div className={LOAD_MORE_FOOTER_CLASS_NAME}>
          <button
            type="button"
            onClick={() => void loadMoreSnapshot()}
            className={cn(
              LOAD_MORE_HINT_CLASS_NAME,
              "rounded-full border border-border/70 px-3 py-1 transition-colors hover:border-border hover:text-foreground",
            )}
          >
            加载更多时出了点小问题，再试一次
          </button>
        </div>
      );
    }

    if (!articleListHasMore) {
      return (
        <div className={LOAD_MORE_FOOTER_CLASS_NAME}>
          <p className={LOAD_MORE_HINT_CLASS_NAME}>已经到底了，暂时没有更多内容</p>
        </div>
      );
    }

    return null;
  };

  const onRefreshClick = () => {
    if (!canRefresh) return;

    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const view = selectedView;
    const isGlobalView = isAggregateView;
    const isDigestView = isAiDigestView;

    setRefreshing(true);

    void (async () => {
      try {
        if (isGlobalView) {
          const result = await refreshAllFeeds({ notifyOnError: false });
          if (!result.runId) {
            runImmediateFailure({
              actionKey: 'feed.refreshAll',
              err: '暂时无法获取运行状态，请稍后重试',
            });
            return;
          }

          beginDeferredOperation({
            actionKey: 'feed.refreshAll',
            trackingKey: result.runId,
          });

          const runResult = await pollFeedRefreshRunStatus({
            runId: result.runId,
            view,
            loadSnapshot,
            isCurrentRequest: () => refreshRequestIdRef.current === requestId,
          });
          if (refreshRequestIdRef.current !== requestId || !runResult) {
            return;
          }

          if (runResult.ok) {
            resolveDeferredOperation({
              actionKey: 'feed.refreshAll',
              trackingKey: result.runId,
            });
            return;
          }

          failDeferredOperation({
            actionKey: 'feed.refreshAll',
            trackingKey: result.runId,
            err: runResult.err,
          });
        } else if (isDigestView) {
          const result = await generateAiDigest(view, { notifyOnError: false });

          if (result.reason === "missing_api_key") {
            runImmediateFailure({
              actionKey: 'aiDigest.generate',
              err: '请先在设置中配置 AI API Key',
            });
            return;
          }

          if (!result.runId) {
            runImmediateFailure({
              actionKey: 'aiDigest.generate',
              err: '暂时无法获取运行状态，请稍后重试',
            });
            return;
          }

          beginDeferredOperation({
            actionKey: 'aiDigest.generate',
            trackingKey: result.runId,
          });

          const runResult = await pollAiDigestRunStatus({
            runId: result.runId,
            isCurrentRequest: () => refreshRequestIdRef.current === requestId,
          });
          if (refreshRequestIdRef.current !== requestId || !runResult) {
            return;
          }

          if (runResult.ok) {
            resolveDeferredOperation({
              actionKey: 'aiDigest.generate',
              trackingKey: result.runId,
            });
            await loadSnapshot({ view }).catch((err) => {
              console.error(err);
            });
            return;
          }

          failDeferredOperation({
            actionKey: 'aiDigest.generate',
            trackingKey: result.runId,
            err: runResult.err,
          });
        } else {
          const result = await refreshFeed(view, { notifyOnError: false });
          if (!result.runId) {
            runImmediateFailure({
              actionKey: 'feed.refresh',
              err: '暂时无法获取运行状态，请稍后重试',
            });
            return;
          }

          beginDeferredOperation({
            actionKey: 'feed.refresh',
            trackingKey: result.runId,
          });

          const runResult = await pollFeedRefreshRunStatus({
            runId: result.runId,
            view,
            loadSnapshot,
            isCurrentRequest: () => refreshRequestIdRef.current === requestId,
          });
          if (refreshRequestIdRef.current !== requestId || !runResult) {
            return;
          }

          if (runResult.ok) {
            resolveDeferredOperation({
              actionKey: 'feed.refresh',
              trackingKey: result.runId,
            });
            return;
          }

          failDeferredOperation({
            actionKey: 'feed.refresh',
            trackingKey: result.runId,
            err: runResult.err,
          });
        }
      } catch (err) {
        runImmediateFailure({
          actionKey: isDigestView ? 'aiDigest.generate' : isGlobalView ? 'feed.refreshAll' : 'feed.refresh',
          err,
        });
      } finally {
        if (refreshRequestIdRef.current === requestId) {
          setRefreshing(false);
        }
      }
    })();
  };

  const onToggleDisplayMode = () => {
    if (!selectedFeed || displayModeSaving) return;

    const previousMode = selectedFeed.articleListDisplayMode ?? "card";
    const nextMode = previousMode === "card" ? "list" : "card";
    const feedId = selectedFeed.id;
    const requestId = displayModeRequestIdRef.current + 1;
    displayModeRequestIdRef.current = requestId;
    setDisplayModeSaving(true);

    useAppStore.setState((state) => ({
      feeds: state.feeds.map((feed) =>
        feed.id === feedId ? { ...feed, articleListDisplayMode: nextMode } : feed,
      ),
    }));

    void runImmediateOperation({
      actionKey: 'feed.articleListDisplayMode.update',
      execute: () =>
        patchFeed(feedId, { articleListDisplayMode: nextMode }, { notifyOnError: false }),
    })
      .then((updated) => {
        if (displayModeRequestIdRef.current !== requestId) return;
        useAppStore.setState((state) => ({
          feeds: state.feeds.map((feed) =>
            feed.id === feedId
              ? { ...feed, articleListDisplayMode: updated.articleListDisplayMode }
              : feed,
          ),
        }));
      })
      .catch(() => {
        if (displayModeRequestIdRef.current !== requestId) return;
        useAppStore.setState((state) => ({
          feeds: state.feeds.map((feed) =>
            feed.id === feedId ? { ...feed, articleListDisplayMode: previousMode } : feed,
          ),
        }));
      })
      .finally(() => {
        if (displayModeRequestIdRef.current !== requestId) return;
        setDisplayModeSaving(false);
      });
  };

  const renderVirtualRow = (row: (typeof visibleRows)[number]) => {
    if (row.type === "section") {
      return (
        <div
          key={row.key}
          className="flex items-center px-4 py-2"
          style={{ height: row.height }}
        >
          <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
            {row.sectionTitle}
          </h3>
        </div>
      );
    }

    const article = row.article;
    if (!article) {
      return null;
    }

    const previewImage = previewImageByArticleId.get(article.id);
    const previewImageStatus = previewImage
      ? previewImageStatuses.get(previewImage.key)
      : undefined;
    const showPreviewImage = previewImageStatus === "ready";
    const displayTitle = article.titleZh?.trim() || article.title;
    const articleFiltered = shouldShowFilteredBadge(article);
    const articleBriefContent = aiDigestFeedIds.has(article.feedId)
      ? resolveArticleBriefContent({
          summary: article.summary,
          contentHtml: article.content,
        })
      : article.summary;

    if (effectiveDisplayMode === "list") {
      return (
        <button
          key={row.key}
          data-article-nav="true"
          data-article-id={article.id}
          type="button"
          onClick={() => setSelectedArticle(article.id)}
          onKeyDown={(event) => handleArticleKeyDown(event, article.id)}
          aria-current={selectedArticleId === article.id ? "true" : undefined}
          aria-label={getArticleButtonLabel(article, displayTitle)}
          className={cn(
            "w-full px-4 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
            selectedArticleId === article.id
              ? "bg-accent"
              : READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
          )}
          style={{ height: row.height }}
        >
          <div className="min-w-0">
            <span
              data-testid={`article-list-row-${article.id}-title`}
              title={displayTitle}
              className={cn(
                "block min-w-0 truncate text-[0.94rem] leading-[1.35]",
                article.isRead
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              {displayTitle}
            </span>
            <div className="mt-1 flex items-center justify-between gap-3 text-[11px]">
              <div className="min-w-0 flex items-center gap-2">
                <span
                  data-testid={`article-list-row-${article.id}-feed`}
                  className="min-w-0 max-w-[10.5rem] truncate font-medium text-muted-foreground"
                >
                  {getFeedTitle(article.feedId)}
                </span>
                {articleFiltered ? (
                  <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                    {getFilteredReasonLabel(article.filteredBy)}
                  </Badge>
                ) : null}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {!article.isRead && (
                  <span
                    data-testid={`article-list-row-${article.id}-unread-dot`}
                    aria-hidden="true"
                    className={unreadSignalDotClassName}
                  />
                )}
                <span
                  data-testid={`article-list-row-${article.id}-time`}
                  className={article.isRead ? "text-muted-foreground" : unreadSignalTimeClassName}
                >
                  {formatRelativeTime(article.publishedAt, referenceTime)}
                </span>
              </div>
            </div>
          </div>
        </button>
      );
    }

    return (
      <button
        key={row.key}
        data-article-nav="true"
        data-article-id={article.id}
        ref={(node) => {
          if (node) {
            articleCardRefs.current.set(article.id, node);
            return;
          }

          articleCardRefs.current.delete(article.id);
        }}
        type="button"
        onClick={() => setSelectedArticle(article.id)}
        onKeyDown={(event) => handleArticleKeyDown(event, article.id)}
        aria-current={selectedArticleId === article.id ? "true" : undefined}
        aria-label={getArticleButtonLabel(article, displayTitle)}
        className={cn(
          "w-full px-4 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          selectedArticleId === article.id
            ? "bg-accent"
            : READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
        )}
        style={{ height: row.height }}
      >
        <div className="flex h-full items-stretch gap-3">
          <div className="flex h-full min-w-0 flex-1 flex-col">
            <h3
              data-testid={`article-card-${article.id}-title`}
              ref={(titleElement) => {
                if (titleElement) {
                  cardTitleRefs.current.set(article.id, titleElement);
                  return;
                }

                cardTitleRefs.current.delete(article.id);
              }}
              className={cn(
                "line-clamp-2 text-[0.94rem] leading-[1.35]",
                article.isRead
                  ? "font-medium text-muted-foreground"
                  : "font-semibold text-foreground",
              )}
            >
              {displayTitle}
            </h3>

            <p
              data-testid={`article-card-${article.id}-summary`}
              className={cn(
                "mt-0.5 text-[12px] leading-relaxed text-muted-foreground",
                wrappedCardTitleArticleIds.has(article.id) ? "line-clamp-1" : "line-clamp-2",
              )}
            >
              {articleBriefContent}
            </p>

            <div className="mt-auto flex items-center justify-between gap-3 pt-1.5 text-[11px]">
              <div className="min-w-0 flex items-center gap-2">
                <span className="max-w-[10.5rem] truncate font-medium text-muted-foreground">
                  {getFeedTitle(article.feedId)}
                </span>
                {articleFiltered ? (
                  <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                    {getFilteredReasonLabel(article.filteredBy)}
                  </Badge>
                ) : null}
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                {!article.isRead && (
                  <span
                    data-testid={`article-card-${article.id}-unread-dot`}
                    aria-hidden="true"
                    className={unreadSignalDotClassName}
                  />
                )}
                <span
                  data-testid={`article-card-${article.id}-time`}
                  className={article.isRead ? "text-muted-foreground" : unreadSignalTimeClassName}
                >
                  {formatRelativeTime(article.publishedAt, referenceTime)}
                </span>
              </div>
            </div>
          </div>

          {showPreviewImage && previewImage ? (
            <div className="h-full w-24 shrink-0 overflow-hidden rounded-md bg-muted">
              <img
                src={previewImage.src}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                fetchPriority="low"
                width={96}
                height={104}
                className="h-full w-full object-cover"
                onError={() => {
                  setPreviewImageStatuses((previousStatuses) => {
                    if (previousStatuses.get(previewImage.key) === "failed") {
                      return previousStatuses;
                    }

                    const nextStatuses = new Map(previousStatuses);
                    nextStatuses.set(previewImage.key, "failed");
                    return nextStatuses;
                  });
                }}
              />
            </div>
          ) : null}
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col" aria-busy={refreshing || displayModeSaving}>
      <div className="flex h-12 min-w-0 items-center justify-between gap-3 px-4">
        <h2
          className="min-w-0 truncate text-[0.96rem] font-semibold tracking-[0.01em]"
          title={headerTitle}
        >
          {headerTitle}
        </h2>
        <div className="shrink-0 flex items-center gap-2">
          <ReaderToolbarIconButton
            icon={RefreshCw}
            label={refreshButtonTitle}
            disabled={!canRefresh}
            onClick={onRefreshClick}
            iconClassName={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
          />
          {!isAggregateView && selectedFeed && (
            <ReaderToolbarIconButton
              icon={effectiveDisplayMode === "card" ? List : LayoutGrid}
              label={displayModeButtonTitle}
              disabled={displayModeSaving}
              pressed={effectiveDisplayMode === "list"}
              onClick={onToggleDisplayMode}
            />
          )}
          {showUnreadToggleAction && (
            <ReaderToolbarIconButton
              icon={CircleDot}
              label={unreadOnlyButtonLabel}
              pressed={showUnreadOnly}
              onClick={toggleShowUnreadOnly}
            />
          )}
          {showMarkAllAsReadAction && (
            <ReaderToolbarIconButton
              icon={CheckCheck}
              label="标记全部为已读"
              onClick={handleMarkAllAsRead}
            />
          )}
          <span className="text-[10px] font-medium text-muted-foreground">{articleCount} 篇</span>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto pb-3 pt-1"
      >
        {articleSections.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6 py-10">
            <p className="text-center text-muted-foreground">{emptyStateMessage}</p>
          </div>
        ) : (
          <>
            <div aria-hidden="true" style={{ height: virtualWindow.topSpacerHeight }} />
            {visibleRows.map(renderVirtualRow)}
            <div aria-hidden="true" style={{ height: virtualWindow.bottomSpacerHeight }} />
            {renderLoadMoreFooter()}
          </>
        )}
      </div>
    </div>
  );
}
