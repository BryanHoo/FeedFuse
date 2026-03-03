import { ChevronDown, ChevronRight, CircleDot, Newspaper, Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import AddFeedDialog from './AddFeedDialog';
import EditFeedDialog from './EditFeedDialog';
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
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { mapApiErrorToUserMessage } from '../notifications/mapApiErrorToUserMessage';
import { useNotify } from '../notifications/useNotify';
import { cn } from '@/lib/utils';

const uncategorizedName = '未分类';
const uncategorizedId = 'cat-uncategorized';

export default function FeedList() {
  const {
    categories: appCategories,
    feeds,
    selectedView,
    setSelectedView,
    toggleCategory,
    addFeed,
    updateFeed,
    removeFeed,
  } = useAppStore();
  const [addFeedOpen, setAddFeedOpen] = useState(false);
  const [editFeedId, setEditFeedId] = useState<string | null>(null);
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);
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

  return (
    <>
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between px-4">
          <h1 className="flex items-center gap-2">
            <img src="/feedfuse-logo.svg" alt="FeedFuse" className="h-7 w-7 shrink-0" />
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

            return (
              <div key={category.id} className="mb-1.5">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span>{category.name}</span>
                </button>

                {expanded && (
                  <div className="mt-0.5 space-y-0.5 pl-4">
                    {categoryFeeds.map((feed) => (
                      <ContextMenu key={feed.id}>
                        <ContextMenuTrigger asChild>
                          <button
                            onClick={() => setSelectedView(feed.id)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                              selectedView === feed.id
                                ? 'bg-primary/10 text-primary'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                              !feed.enabled && 'opacity-60',
                            )}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                                <span aria-hidden="true" className="text-[11px] leading-none">
                                  📰
                                </span>
                                {feed.icon ? (
                                  <img
                                    src={feed.icon}
                                    alt=""
                                    aria-hidden="true"
                                    loading="lazy"
                                    className="absolute inset-0 h-full w-full rounded-[3px] bg-background object-cover"
                                    onError={(event) => {
                                      event.currentTarget.style.display = 'none';
                                    }}
                                  />
                                ) : null}
                              </span>
                              <span className="truncate font-medium">{feed.title}</span>
                            </div>
                            {feed.unreadCount > 0 && (
                              <Badge
                                variant="secondary"
                                className="h-5 min-w-6 justify-center px-1.5 text-[10px] font-semibold tabular-nums"
                              >
                                {feed.unreadCount}
                              </Badge>
                            )}
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onSelect={() => {
                              setEditFeedId(feed.id);
                            }}
                          >
                            编辑
                          </ContextMenuItem>
                          <ContextMenuItem
                            onSelect={() => {
                              void (async () => {
                                try {
                                  await updateFeed(feed.id, { enabled: !feed.enabled });
                                  notify.success(feed.enabled ? '已停用订阅源' : '已启用订阅源');
                                } catch (err) {
                                  notify.error(mapApiErrorToUserMessage(err, 'toggle-feed-enabled'));
                                }
                              })();
                            }}
                          >
                            {feed.enabled ? '停用' : '启用'}
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            onSelect={() => {
                              setDeleteFeedId(feed.id);
                            }}
                          >
                            删除
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
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
          onSubmit={({
            title,
            url,
            siteUrl,
            categoryId,
            fullTextOnOpenEnabled,
            aiSummaryOnOpenEnabled,
            titleTranslateEnabled,
            bodyTranslateEnabled,
          }) =>
            addFeed({
              title,
              url,
              siteUrl,
              categoryId,
              fullTextOnOpenEnabled,
              aiSummaryOnOpenEnabled,
              titleTranslateEnabled,
              bodyTranslateEnabled,
            })
          }
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
            <AlertDialogDescription>
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
                  } catch (err) {
                    notify.error(mapApiErrorToUserMessage(err, 'delete-feed'));
                  }
                })();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
