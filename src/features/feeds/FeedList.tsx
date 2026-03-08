import { AlertCircle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, CircleDot, FileText, FolderTree, Languages, Newspaper, PencilLine, Plus, Power, Sparkles, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import AddFeedDialog from './AddFeedDialog';
import EditFeedDialog from './EditFeedDialog';
import FeedFulltextPolicyDialog from './FeedFulltextPolicyDialog';
import FeedSummaryPolicyDialog from './FeedSummaryPolicyDialog';
import FeedTranslationPolicyDialog from './FeedTranslationPolicyDialog';
import FeedKeywordFilterDialog from './FeedKeywordFilterDialog';
import RenameCategoryDialog from './RenameCategoryDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useNotify } from '../notifications/useNotify';
import { cn } from '@/lib/utils';

const uncategorizedName = '未分类';
const uncategorizedId = 'cat-uncategorized';


interface FeedListProps {
  reserveCloseButtonSpace?: boolean;
}

export default function FeedList({ reserveCloseButtonSpace = false }: FeedListProps) {
  const appCategories = useAppStore((state) => state.categories);
  const feeds = useAppStore((state) => state.feeds);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const selectedView = useAppStore((state) => state.selectedView);
  const setSelectedView = useAppStore((state) => state.setSelectedView);
  const toggleCategory = useAppStore((state) => state.toggleCategory);
  const addFeed = useAppStore((state) => state.addFeed);
  const updateFeed = useAppStore((state) => state.updateFeed);
  const removeFeed = useAppStore((state) => state.removeFeed);
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [editFeedId, setEditFeedId] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);
  const [fulltextPolicyFeedId, setFulltextPolicyFeedId] = useState<string | null>(null);
  const [summaryPolicyFeedId, setSummaryPolicyFeedId] = useState<string | null>(null);
  const [translationPolicyFeedId, setTranslationPolicyFeedId] = useState<string | null>(null);
  const [keywordFilterFeedId, setKeywordFilterFeedId] = useState<string | null>(null);
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [hoveredFeedErrorId, setHoveredFeedErrorId] = useState<string | null>(null);
  const notify = useNotify();

  const smartViews = [
    { id: 'all', name: '全部文章', Icon: Newspaper },
    { id: 'unread', name: '未读文章', Icon: CircleDot },
    { id: 'starred', name: '收藏文章', Icon: Star },
  ] as const;

  const openAddFeedModal = () => {
    setAddFeedOpen(true);
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

  const activeKeywordFilterFeed = useMemo(
    () => (keywordFilterFeedId ? feeds.find((feed) => feed.id === keywordFilterFeedId) ?? null : null),
    [keywordFilterFeedId, feeds],
  );

  const moveCategory = async (categoryId: string, direction: 'up' | 'down') => {
    const categoryIndex = categoryMaster.findIndex((category) => category.id === categoryId);
    if (categoryIndex < 0) return;

    const targetIndex = direction === 'up' ? categoryIndex - 1 : categoryIndex + 1;
    if (targetIndex < 0 || targetIndex >= categoryMaster.length) return;

    const nextOrder = [...categoryMaster];
    const [category] = nextOrder.splice(categoryIndex, 1);
    if (!category) return;
    nextOrder.splice(targetIndex, 0, category);

    try {
      await reorderCategories(nextOrder.map((item, index) => ({ id: item.id, position: index })));
      await loadSnapshot({ view: selectedView });
      notify.success('已更新分类顺序');
    } catch {
      // apiClient handles failure notifications globally
    }
  };

  const renameCategory = async (name: string) => {
    if (!activeRenameCategory) return;

    await patchCategory(activeRenameCategory.id, { name });
    await loadSnapshot({ view: selectedView });
    notify.success('已更新分类');
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory(categoryId);
      await loadSnapshot({ view: selectedView });
      notify.success('已删除分类');
    } catch {
      // apiClient handles failure notifications globally
    }
  };

  const moveFeedToCategory = async (feedId: string, categoryId: string | null, categoryName: string) => {
    try {
      await updateFeed(feedId, { categoryId });
      notify.success(`已移动到「${categoryName}」`);
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
          <Button
            onClick={openAddFeedModal}
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            aria-label="add-feed"
            title="添加 RSS 源"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-0.5 px-2 pb-2 pt-1">
          {smartViews.map((view) => (
            <button
              key={view.id}
              type="button"
              onClick={() => setSelectedView(view.id)}
              className={cn(
                'w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
                selectedView === view.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <view.Icon aria-hidden="true" className="mr-2 inline-block h-4 w-4 shrink-0 align-[-2px]" />
              <span>{view.name}</span>
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
                className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
                  <div className="mt-0.5 space-y-0.5 pl-4">
                    {categoryFeeds.map((feed) => {
                      const isFeedErrored = Boolean(feed.fetchError);
                      const feedButton = (
                        <button
                          type="button"
                          onClick={() => setSelectedView(feed.id)}
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
                            'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                            selectedView === feed.id
                              ? 'bg-primary/10 text-primary'
                              : 'text-foreground hover:bg-accent hover:text-accent-foreground',
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
                            {isFeedErrored ? <span className="sr-only">该订阅源最近更新失败</span> : null}
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
                        {isFeedErrored ? (
                          <ContextMenuTrigger asChild>
                            <span className="block">
                              <TooltipProvider delayDuration={150}>
                                <Tooltip open={hoveredFeedErrorId === feed.id}>
                                  <TooltipTrigger asChild>{feedButton}</TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-64 whitespace-normal">
                                    <div className="space-y-1">
                                      <p className="font-medium">更新失败</p>
                                      <p>{feed.fetchError}</p>
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
                              setEditFeedId(feed.id);
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
                              setKeywordFilterFeedId(feed.id);
                            }}
                          >
                            <ContextMenuItemIcon aria-hidden="true">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </ContextMenuItemIcon>
                            <ContextMenuItemLabel>配置关键词过滤</ContextMenuItemLabel>
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => {
                              void (async () => {
                                try {
                                  await updateFeed(feed.id, { enabled: !feed.enabled });
                                  notify.success(feed.enabled ? '已停用订阅源' : '已启用订阅源');
                                } catch {
                                  // apiClient handles failure notifications globally
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

      <FeedKeywordFilterDialog
        open={Boolean(activeKeywordFilterFeed)}
        feed={activeKeywordFilterFeed}
        onOpenChange={(open) => {
          if (!open) {
            setKeywordFilterFeedId(null);
          }
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
                    await removeFeed(deleteFeedId);
                    setDeleteFeedId(null);
                    notify.success('已删除订阅源');
                  } catch {
                    // apiClient handles failure notifications globally
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
