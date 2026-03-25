import dynamic from 'next/dynamic';
import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileText, FolderTree, Languages, Newspaper, PencilLine, Plus, Power, Sparkles, Star, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import type { ViewType } from '../../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuItemHint,
  ContextMenuItemIcon,
  ContextMenuItemLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { deleteCategory, patchCategory, reorderCategories } from '@/lib/apiClient';
import { READER_PANE_HOVER_BACKGROUND_CLASS_NAME } from '@/lib/designSystem';
import { runImmediateOperation } from '../notifications/userOperationNotifier';
import { cn } from '@/lib/utils';
import { AI_DIGEST_VIEW_ID } from '@/lib/view';
import { useHydratedSelectedView } from '../reader/useHydratedSelectedView';

const uncategorizedName = '未分类';
const uncategorizedId = 'cat-uncategorized';
const AddFeedDialog = dynamic(() => import('./AddFeedDialog'), { ssr: false, loading: () => null });
const AddAiDigestDialog = dynamic(() => import('./AddAiDigestDialog'), { ssr: false, loading: () => null });
const EditFeedDialog = dynamic(() => import('./EditFeedDialog'), { ssr: false, loading: () => null });
const EditAiDigestDialog = dynamic(() => import('./EditAiDigestDialog'), { ssr: false, loading: () => null });
const FeedFulltextPolicyDialog = dynamic(() => import('./FeedFulltextPolicyDialog'), {
  ssr: false,
  loading: () => null,
});
const FeedSummaryPolicyDialog = dynamic(() => import('./FeedSummaryPolicyDialog'), {
  ssr: false,
  loading: () => null,
});
const FeedTranslationPolicyDialog = dynamic(() => import('./FeedTranslationPolicyDialog'), {
  ssr: false,
  loading: () => null,
});
const RenameCategoryDialog = dynamic(() => import('./RenameCategoryDialog'), {
  ssr: false,
  loading: () => null,
});


interface FeedListProps {
  reserveCloseButtonSpace?: boolean;
  initialSelectedView?: ViewType;
}

export default function FeedList({
  reserveCloseButtonSpace = false,
  initialSelectedView,
}: FeedListProps) {
  const appCategories = useAppStore((state) => state.categories);
  const feeds = useAppStore((state) => state.feeds);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const showFilteredByFeedId = useAppStore((state) => state.showFilteredByFeedId);
  const selectedView = useAppStore((state) => state.selectedView);
  const setSelectedView = useAppStore((state) => state.setSelectedView);
  const toggleCategory = useAppStore((state) => state.toggleCategory);
  const toggleShowFilteredForFeed = useAppStore((state) => state.toggleShowFilteredForFeed);
  const addFeed = useAppStore((state) => state.addFeed);
  const updateFeed = useAppStore((state) => state.updateFeed);
  const removeFeed = useAppStore((state) => state.removeFeed);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [addAiDigestOpen, setAddAiDigestOpen] = useState(false);
  const [editFeedId, setEditFeedId] = useState<string | null>(null);
  const [editAiDigestFeedId, setEditAiDigestFeedId] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);
  const [fulltextPolicyFeedId, setFulltextPolicyFeedId] = useState<string | null>(null);
  const [summaryPolicyFeedId, setSummaryPolicyFeedId] = useState<string | null>(null);
  const [translationPolicyFeedId, setTranslationPolicyFeedId] = useState<string | null>(null);
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [hoveredFeedErrorId, setHoveredFeedErrorId] = useState<string | null>(null);

  const allArticlesUnreadCount = useMemo(
    () => feeds.reduce((count, feed) => count + feed.unreadCount, 0),
    [feeds],
  );
  const aiDigestUnreadCount = useMemo(
    () =>
      feeds.reduce(
        (count, feed) => count + ((feed.kind ?? 'rss') === 'ai_digest' ? feed.unreadCount : 0),
        0,
      ),
    [feeds],
  );
  // Smart views derive counts from the same unread source data as the concrete feed rows.
  const smartViews = [
    { id: 'all', name: '全部文章', Icon: Newspaper, unreadCount: allArticlesUnreadCount },
    { id: 'starred', name: '收藏文章', Icon: Star, unreadCount: 0 },
    { id: AI_DIGEST_VIEW_ID, name: '智能解读', Icon: Sparkles, unreadCount: aiDigestUnreadCount },
  ] as const;

  const openAddFeedModal = () => setAddFeedOpen(true);
  const openAddAiDigestModal = () => setAddAiDigestOpen(true);

  const handleCategoryKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    categoryId: string,
    expanded: boolean,
  ) => {
    if (event.key === 'ArrowLeft' && expanded) {
      event.preventDefault();
      toggleCategory(categoryId);
      return;
    }

    if (event.key === 'ArrowRight' && !expanded) {
      event.preventDefault();
      toggleCategory(categoryId);
    }
  };

  const categoryMaster = useMemo(() => {
    return appCategories
      .filter((item) => item.id !== uncategorizedId && item.name !== uncategorizedName)
      .map((item) => ({ id: item.id, name: item.name }));
  }, [appCategories]);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();

    appCategories.forEach((item) => {
      map.set(item.id, item.name);
    });
    categoryMaster.forEach((item) => {
      map.set(item.id, item.name);
    });

    return map;
  }, [appCategories, categoryMaster]);

  const categoryIdByName = useMemo(() => {
    const map = new Map<string, string>();

    categoryNameById.forEach((name, id) => {
      const key = name.trim().toLowerCase();
      if (!key || map.has(key)) {
        return;
      }
      map.set(key, id);
    });

    return map;
  }, [categoryNameById]);

  const feedGroups = useMemo(() => {
    type FeedGroup = { id: string; name: string; feeds: typeof feeds };
    const groups = new Map<string, FeedGroup>();

    feeds.forEach((feed) => {
      const normalizedCategoryId = feed.categoryId?.trim();
      const normalizedLegacyCategory = feed.category?.trim();

      let groupId = uncategorizedId;
      let groupName = uncategorizedName;

      if (normalizedCategoryId && categoryNameById.has(normalizedCategoryId)) {
        groupId = normalizedCategoryId;
        groupName = categoryNameById.get(normalizedCategoryId) ?? uncategorizedName;
      } else if (normalizedLegacyCategory) {
        const mappedCategoryId = categoryIdByName.get(normalizedLegacyCategory.toLowerCase());
        if (mappedCategoryId) {
          groupId = mappedCategoryId;
          groupName = categoryNameById.get(mappedCategoryId) ?? normalizedLegacyCategory;
        }
      }

      const existing = groups.get(groupId);
      if (existing) {
        existing.feeds.push(feed);
      } else {
        groups.set(groupId, { id: groupId, name: groupName, feeds: [feed] });
      }
    });

    categoryMaster.forEach((category) => {
      if (!groups.has(category.id)) {
        groups.set(category.id, { id: category.id, name: category.name, feeds: [] });
      }
    });

    if (!groups.has(uncategorizedId)) {
      groups.set(uncategorizedId, { id: uncategorizedId, name: uncategorizedName, feeds: [] });
    }

    const orderedIds = [
      ...categoryMaster.map((item) => item.id),
      uncategorizedId,
      ...Array.from(groups.keys()).filter(
        (id) => id !== uncategorizedId && !categoryMaster.some((category) => category.id === id)
      ),
    ];

    return orderedIds
      .map((id) => groups.get(id))
      .filter((group): group is FeedGroup => group !== undefined && group.feeds.length > 0);
  }, [feeds, categoryMaster, categoryNameById, categoryIdByName]);

  const expandedByCategoryId = new Map(appCategories.map((item) => [item.id, item.expanded ?? true]));

  const activeEditFeed = useMemo(
    () => (editFeedId ? feeds.find((feed) => feed.id === editFeedId) ?? null : null),
    [editFeedId, feeds],
  );
  const activeEditAiDigestFeed = useMemo(
    () =>
      editAiDigestFeedId
        ? feeds.find((feed) => feed.id === editAiDigestFeedId && (feed.kind ?? 'rss') === 'ai_digest') ?? null
        : null,
    [editAiDigestFeedId, feeds],
  );

  const activeDeleteFeed = useMemo(
    () => (deleteFeedId ? feeds.find((feed) => feed.id === deleteFeedId) ?? null : null),
    [deleteFeedId, feeds],
  );
  const activeRenameCategory = useMemo(
    () => (renameCategoryId ? categoryMaster.find((category) => category.id === renameCategoryId) ?? null : null),
    [categoryMaster, renameCategoryId],
  );
  const activeDeleteCategory = useMemo(
    () => (deleteCategoryId ? categoryMaster.find((category) => category.id === deleteCategoryId) ?? null : null),
    [categoryMaster, deleteCategoryId],
  );
  const activeFulltextPolicyFeed = useMemo(
    () => (fulltextPolicyFeedId ? feeds.find((feed) => feed.id === fulltextPolicyFeedId) ?? null : null),
    [fulltextPolicyFeedId, feeds],
  );
  const activeSummaryPolicyFeed = useMemo(
    () => (summaryPolicyFeedId ? feeds.find((feed) => feed.id === summaryPolicyFeedId) ?? null : null),
    [summaryPolicyFeedId, feeds],
  );
  const activeTranslationPolicyFeed = useMemo(
    () =>
      translationPolicyFeedId ? feeds.find((feed) => feed.id === translationPolicyFeedId) ?? null : null,
    [translationPolicyFeedId, feeds],
  );
  const renderedSelectedView = useHydratedSelectedView(selectedView, initialSelectedView);

  const loadSnapshotSilently = async (view: ViewType) => {
    try {
      await loadSnapshot({ view });
    } catch {
      // Snapshot refresh after a successful write should stay silent.
    }
  };

  const moveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const categoryIndex = categoryMaster.findIndex((category) => category.id === categoryId);
    if (categoryIndex < 0) return;

    const targetIndex = direction === 'up' ? categoryIndex - 1 : categoryIndex + 1;
    if (targetIndex < 0 || targetIndex >= categoryMaster.length) return;

    const nextOrder = [...categoryMaster];
    const [category] = nextOrder.splice(categoryIndex, 1);
    if (!category) return;
    nextOrder.splice(targetIndex, 0, category);

    await runImmediateOperation({
      actionKey: 'category.reorder',
      execute: () =>
        reorderCategories(
          nextOrder.map((item, index) => ({ id: item.id, position: index })),
          { notifyOnError: false },
        ),
    });
    await loadSnapshotSilently(selectedView);
  };

  const renameCategory = async (name: string) => {
    if (!activeRenameCategory) return;

    await runImmediateOperation({
      actionKey: 'category.update',
      execute: () =>
        patchCategory(activeRenameCategory.id, { name }, { notifyOnError: false }),
    });
    await loadSnapshotSilently(selectedView);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    await runImmediateOperation({
      actionKey: 'category.delete',
      execute: () => deleteCategory(categoryId, { notifyOnError: false }),
    });
    await loadSnapshotSilently(selectedView);
  };

  const moveFeedToCategory = async (feedId: string, categoryId: string | null, categoryName: string) => {
    await runImmediateOperation({
      actionKey: 'feed.moveToCategory',
      context: { categoryName },
      execute: () => updateFeed(feedId, { categoryId }),
    });
  };

  const toggleFilteredArticlesVisibility = async (feedId: string) => {
    toggleShowFilteredForFeed(feedId);
    if (selectedView !== feedId) {
      return;
    }

    try {
      await loadSnapshot({ view: feedId });
    } catch {
      // apiClient handles failure notifications globally
    }
  };

  return (
    <>
      <div className="flex h-full flex-col">
        <div
          data-testid="feed-list-header"
          className={cn('flex h-12 items-center justify-between px-4', reserveCloseButtonSpace && 'pr-16')}
        >
          <h1 className="flex items-center gap-2">
            <img
              src="/feedfuse-logo.svg"
              alt="FeedFuse"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
            />
            <span className="text-[15px] font-semibold leading-none tracking-tight">FeedFuse</span>
          </h1>
          <Popover open={addMenuOpen} onOpenChange={setAddMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                aria-label="添加订阅"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            {/* 固定添加菜单从 + 按钮下方弹出，并保持左边缘对齐 */}
            <PopoverContent side="bottom" align="start" sideOffset={8} className="w-44 p-1">
              <div className="flex flex-col gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start"
                  onClick={() => {
                    setAddMenuOpen(false);
                    openAddFeedModal();
                  }}
                >
                  添加 RSS 源
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-full justify-start"
                  onClick={() => {
                    setAddMenuOpen(false);
                    openAddAiDigestModal();
                  }}
                >
                  添加 AI解读
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-0.5 px-2 pb-2 pt-1">
          {smartViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setSelectedView(view.id)}
              aria-current={renderedSelectedView === view.id ? 'true' : undefined}
              className={cn(
                'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                renderedSelectedView === view.id
                  ? 'bg-primary/10 text-primary'
                  : cn(
                      'text-foreground hover:text-accent-foreground',
                      READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
                    ),
              )}
            >
              <div className="flex min-w-0 items-center">
                <view.Icon aria-hidden="true" className="mr-2 inline-block h-4 w-4 shrink-0 align-[-2px]" />
                <span>{view.name}</span>
              </div>
              {view.unreadCount > 0 ? (
                <Badge
                  variant="secondary"
                  aria-hidden="true"
                  className="h-5 min-w-6 shrink-0 justify-center px-1.5 text-[10px] font-semibold tabular-nums"
                >
                  {view.unreadCount}
                </Badge>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {feedGroups.map((category) => {
            const categoryFeeds = category.feeds;
            const expanded = expandedByCategoryId.get(category.id) ?? true;
            const categoryIndex = categoryMaster.findIndex((item) => item.id === category.id);
            const categoryTrigger = (
              <button
                type="button"
                onClick={() => toggleCategory(category.id)}
                onKeyDown={(event) => handleCategoryKeyDown(event, category.id, expanded)}
                aria-expanded={expanded}
                aria-controls={`feed-category-panel-${category.id}`}
                className={cn(
                  'flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground transition-colors hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                  READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
                )}
              >
                {expanded ? (
                  <ChevronDown size={16} aria-hidden="true" />
                ) : (
                  <ChevronRight size={16} aria-hidden="true" />
                )}
                <span>{category.name}</span>
              </button>
            );

            return (
              <div key={category.id} className="mb-1.5">
                {category.id === uncategorizedId ? (
                  categoryTrigger
                ) : (
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{categoryTrigger}</ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                      <ContextMenuItem onSelect={() => setRenameCategoryId(category.id)}>
                        <ContextMenuItemIcon aria-hidden="true">
                          <PencilLine className="h-3.5 w-3.5" />
                        </ContextMenuItemIcon>
                        <ContextMenuItemLabel>编辑</ContextMenuItemLabel>
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={categoryIndex <= 0}
                        onSelect={() => void moveCategory(category.id, 'up')}
                      >
                        <ContextMenuItemIcon aria-hidden="true">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </ContextMenuItemIcon>
                        <ContextMenuItemLabel>上移</ContextMenuItemLabel>
                      </ContextMenuItem>
                      <ContextMenuItem
                        disabled={categoryIndex < 0 || categoryIndex >= categoryMaster.length - 1}
                        onSelect={() => void moveCategory(category.id, 'down')}
                      >
                        <ContextMenuItemIcon aria-hidden="true">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </ContextMenuItemIcon>
                        <ContextMenuItemLabel>下移</ContextMenuItemLabel>
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem variant="destructive" onSelect={() => setDeleteCategoryId(category.id)}>
                        <ContextMenuItemIcon aria-hidden="true" className="text-current">
                          <Trash2 className="h-3.5 w-3.5" />
                        </ContextMenuItemIcon>
                        <ContextMenuItemLabel>删除</ContextMenuItemLabel>
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )}

                {expanded && (
                  <div id={`feed-category-panel-${category.id}`} className="mt-0.5 space-y-0.5 pl-4">
                    {categoryFeeds.map((feed) => {
                      const fetchErrorText = feed.fetchRawError || feed.fetchError;
                      const isFeedErrored = Boolean(fetchErrorText);
                      const isRssFeed = (feed.kind ?? 'rss') === 'rss';
                      const showFilteredArticles = Boolean(showFilteredByFeedId[feed.id]);
                      const errorDescriptionId = `feed-error-${feed.id}`;
                      const feedButton = (
                        <button
                          type="button"
                          onClick={() => setSelectedView(feed.id)}
                          aria-current={renderedSelectedView === feed.id ? 'true' : undefined}
                          aria-describedby={isFeedErrored ? errorDescriptionId : undefined}
                          onMouseEnter={() => {
                            if (isFeedErrored) {
                              setHoveredFeedErrorId(feed.id);
                            }
                          }}
                          onMouseLeave={() => {
                            setHoveredFeedErrorId((current) => (current === feed.id ? null : current));
                          }}
                          onFocus={() => {
                            if (isFeedErrored) {
                              setHoveredFeedErrorId(feed.id);
                            }
                          }}
                          onBlur={() => {
                            setHoveredFeedErrorId((current) => (current === feed.id ? null : current));
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                            renderedSelectedView === feed.id
                              ? 'bg-primary/10 text-primary'
                              : cn(
                                  'text-foreground hover:text-accent-foreground',
                                  READER_PANE_HOVER_BACKGROUND_CLASS_NAME,
                                ),
                            !feed.enabled && 'opacity-60',
                            isFeedErrored && 'text-destructive hover:text-destructive',
                          )}
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={cn(
                                'relative flex h-4 w-4 shrink-0 items-center justify-center',
                                isFeedErrored && 'text-destructive',
                              )}
                            >
                              <span aria-hidden="true" className="text-[11px] leading-none">
                                📰
                              </span>
                              {feed.icon ? (
                                <img
                                  src={feed.icon}
                                  alt=""
                                  aria-hidden="true"
                                  loading="lazy"
                                  decoding="async"
                                  fetchPriority="low"
                                  width={16}
                                  height={16}
                                  className="absolute inset-0 h-full w-full rounded-[3px] bg-background object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </span>
                            <span className="truncate font-medium">{feed.title}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {isFeedErrored ? (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                            ) : null}
                            {feed.unreadCount > 0 ? (
                              <Badge
                                variant="secondary"
                                className="h-5 min-w-6 justify-center px-1.5 text-[10px] font-semibold tabular-nums"
                              >
                                {feed.unreadCount}
                              </Badge>
                            ) : null}
                          </div>
                        </button>
                      );

                      return (
                      <ContextMenu key={feed.id}>
                        {isFeedErrored ? <span id={errorDescriptionId} className="sr-only">最近更新失败：{fetchErrorText}</span> : null}
                        {isFeedErrored ? (
                          <ContextMenuTrigger asChild>
                            <span className="block">
                              <TooltipProvider delayDuration={150}>
                                <Tooltip open={hoveredFeedErrorId === feed.id}>
                                  <TooltipTrigger asChild>{feedButton}</TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-64 whitespace-normal">
                                    <div className="space-y-1">
                                      <p className="font-medium">更新失败</p>
                                      <p>{fetchErrorText}</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </span>
                          </ContextMenuTrigger>
                        ) : (
                          <ContextMenuTrigger asChild>{feedButton}</ContextMenuTrigger>
                        )}
                        <ContextMenuContent className="w-48">
                          <ContextMenuItem
                            onSelect={() => {
                              if (isRssFeed) {
                                setEditFeedId(feed.id);
                                return;
                              }
                              setEditAiDigestFeedId(feed.id);
                            }}
                          >
                            <ContextMenuItemIcon aria-hidden="true">
                              <PencilLine className="h-3.5 w-3.5" />
                            </ContextMenuItemIcon>
                            <ContextMenuItemLabel>编辑</ContextMenuItemLabel>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger>
                              <ContextMenuItemIcon aria-hidden="true">
                                <FolderTree className="h-3.5 w-3.5" />
                              </ContextMenuItemIcon>
                              <ContextMenuItemLabel>移动到分类</ContextMenuItemLabel>
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="w-48">
                              {categoryMaster.map((category) => {
                                const isCurrentCategory = feed.categoryId === category.id;

                                return (
                                  <ContextMenuItem
                                    key={category.id}
                                    disabled={isCurrentCategory}
                                    onSelect={() => void moveFeedToCategory(feed.id, category.id, category.name)}
                                  >
                                    <ContextMenuItemIcon
                                      aria-hidden="true"
                                      className={cn(isCurrentCategory && 'text-primary')}
                                    >
                                      <FolderTree className="h-3.5 w-3.5" />
                                    </ContextMenuItemIcon>
                                    <ContextMenuItemLabel>{category.name}</ContextMenuItemLabel>
                                    {isCurrentCategory ? (
                                      <ContextMenuItemHint
                                        aria-hidden="true"
                                        className="border-primary/20 bg-primary/10 text-primary"
                                      >
                                        当前
                                      </ContextMenuItemHint>
                                    ) : null}
                                  </ContextMenuItem>
                                );
                              })}
                              <ContextMenuItem
                                disabled={!feed.categoryId}
                                onSelect={() => void moveFeedToCategory(feed.id, null, uncategorizedName)}
                              >
                                <ContextMenuItemIcon
                                  aria-hidden="true"
                                  className={cn(!feed.categoryId && 'text-primary')}
                                >
                                  <FolderTree className="h-3.5 w-3.5" />
                                </ContextMenuItemIcon>
                                <ContextMenuItemLabel>{uncategorizedName}</ContextMenuItemLabel>
                                {!feed.categoryId ? (
                                  <ContextMenuItemHint
                                    aria-hidden="true"
                                    className="border-primary/20 bg-primary/10 text-primary"
                                  >
                                    当前
                                  </ContextMenuItemHint>
                                ) : null}
                              </ContextMenuItem>
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          {isRssFeed ? (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem
                                onSelect={() => {
                                  setFulltextPolicyFeedId(feed.id);
                                }}
                              >
                                <ContextMenuItemIcon aria-hidden="true">
                                  <FileText className="h-3.5 w-3.5" />
                                </ContextMenuItemIcon>
                                <ContextMenuItemLabel>全文抓取配置</ContextMenuItemLabel>
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  setSummaryPolicyFeedId(feed.id);
                                }}
                              >
                                <ContextMenuItemIcon aria-hidden="true">
                                  <Sparkles className="h-3.5 w-3.5" />
                                </ContextMenuItemIcon>
                                <ContextMenuItemLabel>AI摘要配置</ContextMenuItemLabel>
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  setTranslationPolicyFeedId(feed.id);
                                }}
                              >
                                <ContextMenuItemIcon aria-hidden="true">
                                  <Languages className="h-3.5 w-3.5" />
                                </ContextMenuItemIcon>
                                <ContextMenuItemLabel>翻译配置</ContextMenuItemLabel>
                              </ContextMenuItem>
                              <ContextMenuItem
                                onSelect={() => {
                                  void toggleFilteredArticlesVisibility(feed.id);
                                }}
                              >
                                <ContextMenuItemIcon aria-hidden="true">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </ContextMenuItemIcon>
                                <ContextMenuItemLabel>
                                  {showFilteredArticles ? '隐藏已过滤文章' : '查看已过滤文章'}
                                </ContextMenuItemLabel>
                              </ContextMenuItem>
                            </>
                          ) : null}
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => {
                              void (async () => {
                                try {
                                  await runImmediateOperation({
                                    actionKey: feed.enabled ? 'feed.disable' : 'feed.enable',
                                    execute: () => updateFeed(feed.id, { enabled: !feed.enabled }),
                                  });
                                } catch {
                                  // notifier already handled the failure toast
                                }
                              })();
                            }}
                          >
                            <ContextMenuItemIcon aria-hidden="true">
                              <Power className="h-3.5 w-3.5" />
                            </ContextMenuItemIcon>
                            <ContextMenuItemLabel>{feed.enabled ? '停用' : '启用'}</ContextMenuItemLabel>
                          </ContextMenuItem>
                          <ContextMenuItem
                            variant="destructive"
                            onSelect={() => {
                              setDeleteFeedId(feed.id);
                            }}
                          >
                            <ContextMenuItemIcon aria-hidden="true" className="text-current">
                              <Trash2 className="h-3.5 w-3.5" />
                            </ContextMenuItemIcon>
                            <ContextMenuItemLabel>删除</ContextMenuItemLabel>
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );})}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {addFeedOpen ? (
        <AddFeedDialog
          open
          onOpenChange={setAddFeedOpen}
          categories={categoryMaster}
          onSubmit={(payload) => addFeed(payload)}
        />
      ) : null}

      {addAiDigestOpen ? (
        <AddAiDigestDialog
          open
          onOpenChange={setAddAiDigestOpen}
          categories={categoryMaster}
          feeds={feeds}
        />
      ) : null}

      {activeEditFeed ? (
        <EditFeedDialog
          open
          feed={activeEditFeed}
          categories={categoryMaster}
          onOpenChange={(open) => {
            if (!open) {
              setEditFeedId(null);
            }
          }}
          onSubmit={(payload) => updateFeed(activeEditFeed.id, payload)}
        />
      ) : null}

      {activeEditAiDigestFeed ? (
        <EditAiDigestDialog
          open
          feed={activeEditAiDigestFeed}
          categories={categoryMaster}
          feeds={feeds}
          onOpenChange={(open) => {
            if (!open) {
              setEditAiDigestFeedId(null);
            }
          }}
        />
      ) : null}

      <RenameCategoryDialog
        open={Boolean(activeRenameCategory)}
        category={activeRenameCategory}
        onOpenChange={(open) => {
          if (!open) {
            setRenameCategoryId(null);
          }
        }}
        onSubmit={renameCategory}
      />

      <FeedSummaryPolicyDialog
        open={Boolean(activeSummaryPolicyFeed)}
        feed={activeSummaryPolicyFeed}
        onOpenChange={(open) => {
          if (!open) {
            setSummaryPolicyFeedId(null);
          }
        }}
        onSubmit={async (patch) => {
          if (!activeSummaryPolicyFeed) return;
          await updateFeed(activeSummaryPolicyFeed.id, patch);
        }}
      />

      <FeedFulltextPolicyDialog
        open={Boolean(activeFulltextPolicyFeed)}
        feed={activeFulltextPolicyFeed}
        onOpenChange={(open) => {
          if (!open) {
            setFulltextPolicyFeedId(null);
          }
        }}
        onSubmit={async (patch) => {
          if (!activeFulltextPolicyFeed) return;
          await updateFeed(activeFulltextPolicyFeed.id, patch);
        }}
      />

      <FeedTranslationPolicyDialog
        open={Boolean(activeTranslationPolicyFeed)}
        feed={activeTranslationPolicyFeed}
        onOpenChange={(open) => {
          if (!open) {
            setTranslationPolicyFeedId(null);
          }
        }}
        onSubmit={async (patch) => {
          if (!activeTranslationPolicyFeed) return;
          await updateFeed(activeTranslationPolicyFeed.id, patch);
        }}
      />

      <AlertDialog
        open={Boolean(deleteFeedId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteFeedId(null);
          }
        }}
      >
      <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {activeDeleteFeed ? `确定删除「${activeDeleteFeed.title}」？` : '确定删除该订阅源？'}
              删除后将移除订阅源及其文章，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteFeedId) return;
                void (async () => {
                  try {
                    await runImmediateOperation({
                      actionKey: 'feed.delete',
                      execute: () => removeFeed(deleteFeedId),
                    });
                    setDeleteFeedId(null);
                  } catch {
                    // notifier already handled the failure toast
                  }
                })();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteCategoryId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteCategoryId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {activeDeleteCategory ? `确定删除「${activeDeleteCategory.name}」？` : '确定删除该分类？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-words text-sm text-muted-foreground">
            删除分类不会删除订阅源，订阅源会自动归并到“未分类”。
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (!deleteCategoryId) return;
                  void handleDeleteCategory(deleteCategoryId);
                  setDeleteCategoryId(null);
                }}
              >
                删除
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
