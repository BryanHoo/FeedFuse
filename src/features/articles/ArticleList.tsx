import { CheckCheck, CircleDot, LayoutGrid, List, RefreshCw } from "lucide-react";
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { formatRelativeTime, getArticleSectionHeading, getLocalDayKey } from "../../utils/date";
import { patchFeed, refreshAllFeeds, refreshFeed } from "../../lib/apiClient";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotify } from "../notifications/useNotify";

const sessionVisibleArticleIds = new Set<string>();
const REFRESH_POLL_INTERVAL_MS = 1000;
const REFRESH_POLL_MAX_ATTEMPTS = 12;
const PREVIEW_PRELOAD_MAX_CONCURRENT = 2;
type PreviewImageStatus = "loading" | "ready" | "failed";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPreviewImage(content: string) {
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

function areSetsEqual(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

export default function ArticleList() {
  const articles = useAppStore((state) => state.articles);
  const feeds = useAppStore((state) => state.feeds);
  const selectedView = useAppStore((state) => state.selectedView);
  const selectedArticleId = useAppStore((state) => state.selectedArticleId);
  const setSelectedArticle = useAppStore((state) => state.setSelectedArticle);
  const markAllAsRead = useAppStore((state) => state.markAllAsRead);
  const showUnreadOnly = useAppStore((state) => state.showUnreadOnly);
  const toggleShowUnreadOnly = useAppStore((state) => state.toggleShowUnreadOnly);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const notify = useNotify();
  const refreshRequestIdRef = useRef(0);
  const displayModeRequestIdRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [displayModeSaving, setDisplayModeSaving] = useState(false);

  const showHeaderActions =
    selectedView !== "unread" && selectedView !== "starred";

  const showUnreadFilterActive =
    selectedView === "unread" || (showUnreadOnly && showHeaderActions);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const articleCardRefs = useRef(new Map<string, HTMLButtonElement>());
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

  useEffect(() => {
    refreshRequestIdRef.current += 1;
    displayModeRequestIdRef.current += 1;
    setRefreshing(false);
    setDisplayModeSaving(false);
  }, [selectedView]);

  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state, previousState) => {
      const previousShowHeaderActions =
        previousState.selectedView !== "unread" && previousState.selectedView !== "starred";
      const previousShowUnreadFilterActive =
        previousState.selectedView === "unread" ||
        (previousState.showUnreadOnly && previousShowHeaderActions);

      const currentShowHeaderActions =
        state.selectedView !== "unread" && state.selectedView !== "starred";
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

  const viewScopedArticles = (() => {
    if (selectedView === "all") return articles;
    if (selectedView === "unread") return articles;
    if (selectedView === "starred") return articles.filter((article) => article.isStarred);
    return articles.filter((article) => article.feedId === selectedView);
  })();

  const filteredArticles = (() => {
    if (!showUnreadFilterActive) return viewScopedArticles;

    const retainedArticleIds = sessionVisibleArticleIds;
    const visibleArticles: typeof viewScopedArticles = [];

    for (const article of viewScopedArticles) {
      if (!article.isRead || retainedArticleIds.has(article.id) || article.id === selectedArticleId) {
        visibleArticles.push(article);
      }
    }

    for (const article of visibleArticles) {
      retainedArticleIds.add(article.id);
    }
    return visibleArticles;
  })();

  const articleSections = useMemo(() => {
    const now = new Date();
    const sections: Array<{
      key: string;
      title: string;
      articles: typeof filteredArticles;
    }> = [];

    let currentSection: (typeof sections)[number] | null = null;

    for (const article of filteredArticles) {
      const publishedDate = new Date(article.publishedAt);
      const hasValidDate = !Number.isNaN(publishedDate.getTime());
      const sectionKey = hasValidDate ? getLocalDayKey(publishedDate) : "unknown";

      if (!currentSection || currentSection.key !== sectionKey) {
        const title = hasValidDate ? getArticleSectionHeading(publishedDate, now) : "未知日期";

        currentSection = {
          key: sectionKey,
          title,
          articles: [],
        };

        sections.push(currentSection);
      }

      currentSection.articles.push(article);
    }

    return sections;
  }, [filteredArticles]);

  const previewImageByArticleId = useMemo(() => {
    const previews = new Map<string, { key: string; src: string }>();

    for (const article of filteredArticles) {
      const previewImage = article.previewImage ?? getPreviewImage(article.content);
      if (!previewImage) continue;

      previews.set(article.id, {
        key: `${article.id}:${previewImage}`,
        src: previewImage,
      });
    }

    return previews;
  }, [filteredArticles]);

  const previewImageCandidates = useMemo(() => {
    const candidates = new Map<string, string>();

    for (const { key, src } of previewImageByArticleId.values()) {
      candidates.set(key, src);
    }

    return candidates;
  }, [previewImageByArticleId]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || previewImageByArticleId.size === 0) return;

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

  const getFeedTitle = (feedId: string) => {
    return feeds.find((feed) => feed.id === feedId)?.title ?? "";
  };

  const handleMarkAllAsRead = () => {
    sessionVisibleArticleIds.clear();

    if (selectedView === "all") {
      markAllAsRead();
      return;
    }

    markAllAsRead(selectedView);
  };

  const unreadCount = useMemo(
    () => viewScopedArticles.reduce((count, article) => count + (article.isRead ? 0 : 1), 0),
    [viewScopedArticles],
  );
  const articleCount = showUnreadFilterActive ? unreadCount : filteredArticles.length;

  const isAggregateView =
    selectedView === "all" || selectedView === "unread" || selectedView === "starred";
  const selectedFeed = isAggregateView
    ? null
    : feeds.find((feed) => feed.id === selectedView) ?? null;
  const headerTitle = selectedFeed?.title ?? "文章";
  const effectiveDisplayMode = isAggregateView ? "card" : (selectedFeed?.articleListDisplayMode ?? "card");

  useEffect(() => {
    if (effectiveDisplayMode !== "card") {
      setWrappedCardTitleArticleIds((previousWrappedIds) =>
        previousWrappedIds.size === 0 ? previousWrappedIds : new Set(),
      );
      return;
    }

    const measureWrappedTitles = () => {
      const nextWrappedIds = new Set<string>();

      for (const [articleId, titleElement] of cardTitleRefs.current) {
        const lineHeight = Number.parseFloat(window.getComputedStyle(titleElement).lineHeight);
        if (!Number.isFinite(lineHeight) || lineHeight <= 0) continue;

        if (titleElement.clientHeight > lineHeight + 0.5) {
          nextWrappedIds.add(articleId);
        }
      }

      setWrappedCardTitleArticleIds((previousWrappedIds) =>
        areSetsEqual(previousWrappedIds, nextWrappedIds) ? previousWrappedIds : nextWrappedIds,
      );
    };

    measureWrappedTitles();
    const rafId = window.requestAnimationFrame(measureWrappedTitles);
    window.addEventListener("resize", measureWrappedTitles);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", measureWrappedTitles);
    };
  }, [effectiveDisplayMode, filteredArticles]);

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

    if (selectedView === "starred") {
      return "还没有收藏文章";
    }

    if (selectedFeed) {
      return canRefresh ? "这个订阅源还没有文章" : "这个订阅源还没有可显示的文章";
    }

    return "这里还没有文章";
  })();

  const getArticleButtonLabel = useCallback(
    (article: (typeof filteredArticles)[number], displayTitle: string) => {
      const labelParts = [displayTitle];
      const feedTitle = feeds.find((feed) => feed.id === article.feedId)?.title ?? "";

      if (feedTitle) {
        labelParts.push(feedTitle);
      }

      labelParts.push(formatRelativeTime(article.publishedAt));
      labelParts.push(article.isRead ? "已读" : "未读");

      return labelParts.join("，");
    },
    [feeds],
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

  const refreshButtonTitle = isAggregateView ? "刷新全部订阅源" : "刷新订阅源";

  const onRefreshClick = () => {
    if (!canRefresh) return;

    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    const view = selectedView;
    const isGlobalView = isAggregateView;

    setRefreshing(true);

    void (async () => {
      try {
        if (isGlobalView) {
          await refreshAllFeeds();
          notify.success("已开始刷新全部订阅源");
        } else {
          await refreshFeed(view);
          notify.success("已开始刷新订阅源");
        }

        for (let attempt = 0; attempt < REFRESH_POLL_MAX_ATTEMPTS; attempt += 1) {
          if (refreshRequestIdRef.current !== requestId) return;

          await loadSnapshot({ view });

          if (refreshRequestIdRef.current !== requestId) return;
          if (attempt < REFRESH_POLL_MAX_ATTEMPTS - 1) {
            await sleep(REFRESH_POLL_INTERVAL_MS);
          }
        }

        if (refreshRequestIdRef.current !== requestId) return;
        notify.success(isGlobalView ? "已完成刷新全部订阅源" : "已完成刷新订阅源");
      } catch {
        // apiClient handles failure notifications globally
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

    void patchFeed(feedId, { articleListDisplayMode: nextMode })
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
          <Button
            onClick={onRefreshClick}
            type="button"
            variant="ghost"
            size="icon"
            disabled={!canRefresh}
            className="h-6 w-6 text-muted-foreground"
            aria-label="refresh-feeds"
            title={refreshButtonTitle}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
          {!isAggregateView && selectedFeed && (
            <Button
              onClick={onToggleDisplayMode}
              type="button"
              variant="ghost"
              size="icon"
              disabled={displayModeSaving}
            className={cn(
              "h-6 w-6 text-muted-foreground",
              effectiveDisplayMode === "list" && "bg-primary/10 text-primary hover:bg-primary/15",
            )}
            aria-label="toggle-display-mode"
            aria-pressed={effectiveDisplayMode === "list"}
            title={effectiveDisplayMode === "card" ? "切换为列表" : "切换为卡片"}
          >
              {effectiveDisplayMode === "card" ? (
                <List className="h-3.5 w-3.5" />
              ) : (
                <LayoutGrid className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
          {showHeaderActions && (
            <>
              <Button
                onClick={toggleShowUnreadOnly}
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 text-muted-foreground",
                  showUnreadOnly && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
                aria-label="toggle-unread-only"
                aria-pressed={showUnreadOnly}
                title="仅显示未读"
              >
                <CircleDot className="h-3.5 w-3.5" />
              </Button>
              <Button
                onClick={handleMarkAllAsRead}
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                aria-label="mark-all-as-read"
                title="标记全部为已读"
              >
                <CheckCheck className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <span className="text-[10px] font-medium text-muted-foreground">{articleCount} 篇</span>
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-3 pt-1">
        {articleSections.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-6 py-10">
            <p className="text-center text-muted-foreground">{emptyStateMessage}</p>
          </div>
        ) : (
          articleSections.map((section, sectionIndex) => (
            <div
              key={`${section.key}-${sectionIndex}`}
              className="mt-3 first:mt-0"
            >
              <div className="px-4 py-2">
                <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
                  {section.title}
                </h3>
              </div>

              {section.articles.map((article) => {
                const previewImage = previewImageByArticleId.get(article.id);
                const previewImageStatus = previewImage
                  ? previewImageStatuses.get(previewImage.key)
                  : undefined;
                const showPreviewImage = previewImageStatus === "ready";
                const displayTitle = article.titleZh?.trim() || article.title;

                if (effectiveDisplayMode === "list") {
                  return (
                    <button
                      key={article.id}
                      data-article-nav="true"
                      data-article-id={article.id}
                      type="button"
                      onClick={() => setSelectedArticle(article.id)}
                      onKeyDown={(event) => handleArticleKeyDown(event, article.id)}
                      aria-current={selectedArticleId === article.id ? "true" : undefined}
                      aria-label={getArticleButtonLabel(article, displayTitle)}
                      className={cn(
                        "w-full px-4 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        selectedArticleId === article.id ? "bg-accent" : "hover:bg-accent",
                      )}
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
                          <span
                            data-testid={`article-list-row-${article.id}-feed`}
                            className="min-w-0 max-w-[10.5rem] truncate font-medium text-muted-foreground"
                          >
                            {getFeedTitle(article.feedId)}
                          </span>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {!article.isRead && (
                              <span
                                data-testid={`article-list-row-${article.id}-unread-dot`}
                                aria-hidden="true"
                                className="h-1.5 w-1.5 rounded-full bg-primary"
                              />
                            )}
                            <span
                              data-testid={`article-list-row-${article.id}-time`}
                              className={article.isRead ? "text-muted-foreground" : "text-primary"}
                            >
                              {formatRelativeTime(article.publishedAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                }

                return (
                  <button
                    key={article.id}
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
                      "h-[6.5rem] w-full px-4 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      selectedArticleId === article.id ? "bg-accent" : "hover:bg-accent",
                    )}
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
                          {article.summary}
                        </p>

                        <div className="mt-auto flex items-center justify-between gap-3 pt-1.5 text-[11px]">
                          <span className="max-w-[10.5rem] truncate font-medium text-muted-foreground">
                            {getFeedTitle(article.feedId)}
                          </span>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {!article.isRead && (
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
                            )}
                            <span className={article.isRead ? "text-muted-foreground" : "text-primary"}>
                              {formatRelativeTime(article.publishedAt)}
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
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
