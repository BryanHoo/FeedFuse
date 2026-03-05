import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  ApiError,
  createCategory,
  deleteCategory,
  patchCategory,
  reorderCategories,
} from '../../../lib/apiClient';
import { useNotify } from '../../notifications/useNotify';
import { useAppStore } from '../../../store/appStore';

const uncategorizedName = '未分类';
const uncategorizedId = 'cat-uncategorized';

function getCategoryErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'conflict') {
      return '分类已存在。';
    }
    if (err.code === 'validation_error') {
      return '分类名称无效。';
    }
  }

  return '操作失败，请稍后重试。';
}

export default function CategoriesSettingsPanel() {
  const notify = useNotify();
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftNamesById, setDraftNamesById] = useState<Record<string, string>>({});
  const [rowBusyById, setRowBusyById] = useState<Record<string, boolean>>({});
  const [rowErrorById, setRowErrorById] = useState<Record<string, string>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const appCategories = useAppStore((state) => state.categories);
  const feeds = useAppStore((state) => state.feeds);
  const categories = useMemo(
    () =>
      appCategories.filter(
        (item) => item.id !== uncategorizedId && item.name !== uncategorizedName,
      ),
    [appCategories],
  );

  const feedCountByCategoryId = useMemo(() => {
    const counts = new Map<string, number>();

    feeds.forEach((feed) => {
      if (!feed.categoryId) return;
      counts.set(feed.categoryId, (counts.get(feed.categoryId) ?? 0) + 1);
    });

    return counts;
  }, [feeds]);

  const confirmDeleteCategory = useMemo(() => {
    if (!confirmDeleteId) return null;
    return categories.find((item) => item.id === confirmDeleteId) ?? null;
  }, [confirmDeleteId, categories]);

  const upsertCategoryInStore = (category: { id: string; name: string }) => {
    useAppStore.setState((state) => {
      const uncategorized = state.categories.find((item) => item.id === uncategorizedId) ?? {
        id: uncategorizedId,
        name: uncategorizedName,
        expanded: true,
      };

      const nextCategories = state.categories
        .filter((item) => item.id !== uncategorizedId && item.id !== category.id)
        .concat([{ id: category.id, name: category.name, expanded: true }]);

      return {
        categories: [...nextCategories, uncategorized],
        feeds: state.feeds.map((feed) =>
          feed.categoryId === category.id ? { ...feed, category: category.name } : feed,
        ),
      };
    });
  };

  const removeCategoryFromStore = (categoryId: string) => {
    useAppStore.setState((state) => ({
      categories: state.categories.filter((item) => item.id !== categoryId),
      feeds: state.feeds.map((feed) =>
        feed.categoryId === categoryId
          ? {
              ...feed,
              categoryId: null,
              category: null,
            }
          : feed,
      ),
    }));
  };

  const setCategoriesOrderInStore = (
    orderedCategories: Array<{ id: string; name: string }>,
  ) => {
    useAppStore.setState((state) => {
      const uncategorized = state.categories.find((item) => item.id === uncategorizedId) ?? {
        id: uncategorizedId,
        name: uncategorizedName,
        expanded: true,
      };

      const expandedById = new Map(state.categories.map((item) => [item.id, item.expanded]));
      const nextCategories = orderedCategories.map((item) => ({
        id: item.id,
        name: item.name,
        expanded: expandedById.get(item.id) ?? true,
      }));

      return {
        categories: [...nextCategories, uncategorized],
      };
    });
  };

  const handleReorder = async (dropIndex: number) => {
    if (draggingIndex === null || draggingIndex === dropIndex) {
      setDraggingIndex(null);
      return;
    }

    const previousOrder = [...categories];
    const nextOrder = [...categories];
    const [draggingItem] = nextOrder.splice(draggingIndex, 1);
    if (!draggingItem) {
      setDraggingIndex(null);
      return;
    }
    nextOrder.splice(dropIndex, 0, draggingItem);

    setDraggingIndex(null);
    setCategoriesOrderInStore(nextOrder);

    try {
      await reorderCategories(nextOrder.map((item, index) => ({ id: item.id, position: index })));
    } catch (error) {
      setCategoriesOrderInStore(previousOrder);
      notify.error(getCategoryErrorMessage(error));
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError('请输入分类名称。');
      return;
    }

    setCreating(true);
    setCreateError(null);
    try {
      const created = await createCategory({ name: trimmed });
      upsertCategoryInStore({ id: created.id, name: created.name });
      setNewName('');
      notify.success('已创建分类');
    } catch (err) {
      const message = getCategoryErrorMessage(err);
      setCreateError(message);
      notify.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (categoryId: string, originalName: string) => {
    const value = draftNamesById[categoryId] ?? originalName;
    const trimmed = value.trim();

    if (!trimmed) {
      setRowErrorById((prev) => ({ ...prev, [categoryId]: '请输入分类名称。' }));
      return;
    }

    if (trimmed === originalName.trim()) {
      setRowErrorById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      setDraftNamesById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
      return;
    }

    setRowBusyById((prev) => ({ ...prev, [categoryId]: true }));
    setRowErrorById((prev) => {
      if (!prev[categoryId]) return prev;
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });

    try {
      const saved = await patchCategory(categoryId, { name: trimmed });
      upsertCategoryInStore({ id: saved.id, name: saved.name });
      notify.success('已更新分类');
      setDraftNamesById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    } catch (err) {
      const message = getCategoryErrorMessage(err);
      setRowErrorById((prev) => ({ ...prev, [categoryId]: message }));
      notify.error(message);
    } finally {
      setRowBusyById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    }
  };

  const handleDelete = async (categoryId: string) => {
    setRowBusyById((prev) => ({ ...prev, [categoryId]: true }));
    setRowErrorById((prev) => {
      if (!prev[categoryId]) return prev;
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });

    try {
      await deleteCategory(categoryId);
      removeCategoryFromStore(categoryId);
      notify.success('已删除分类');
      setDraftNamesById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    } catch (err) {
      const message = getCategoryErrorMessage(err);
      setRowErrorById((prev) => ({ ...prev, [categoryId]: message }));
      notify.error(message);
    } finally {
      setRowBusyById((prev) => {
        if (!prev[categoryId]) return prev;
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    }
  };

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="new-category-name" className="mb-1.5 block text-xs text-muted-foreground">
                新分类名称
              </Label>
              <Input
                id="new-category-name"
                aria-label="新分类名称"
                value={newName}
                onChange={(event) => {
                  setNewName(event.target.value);
                  if (createError) setCreateError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (creating) return;
                    void handleCreate();
                  }
                }}
                placeholder="例如：Tech"
              />
              {createError ? (
                <p className="mt-1 text-xs text-destructive">{createError}</p>
              ) : null}
            </div>
            <Button type="button" onClick={handleCreate} disabled={creating} className="h-9">
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              <span>添加分类</span>
            </Button>
          </div>
        </div>

        <Separator />

        <div className="p-4">
          {categories.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-12 text-center">
              <p className="text-sm font-medium text-foreground">暂无分类</p>
              <p className="mt-1 text-xs text-muted-foreground">先创建一个分类，用于分组你的订阅源</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">已有分类</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    支持自动保存；删除分类会将订阅源自动归并到“未分类”
                  </p>
                </div>
                <Badge variant="outline" className="h-6 px-2 text-[11px] font-semibold">
                  共 {categories.length} 个
                </Badge>
              </div>

              <div className="flex flex-col divide-y divide-border rounded-md border border-border/60">
                {categories.map((category, index) => {
                  const feedCount = feedCountByCategoryId.get(category.id) ?? 0;
                  const isBusy = Boolean(rowBusyById[category.id]);

                  return (
                    <div key={category.id} className="px-3 py-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          aria-label={`排序手柄-${index}`}
                          className="mt-2 cursor-move rounded-sm px-1 text-sm text-muted-foreground hover:bg-muted"
                          draggable
                          onDragStart={() => {
                            setDraggingIndex(index);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            void handleReorder(index);
                          }}
                        >
                          ⋮⋮
                        </button>
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`category-name-${index}`} className="sr-only">
                            分类名称
                          </Label>
                          <Input
                            id={`category-name-${index}`}
                            aria-label={`分类名称-${index}`}
                            value={draftNamesById[category.id] ?? category.name}
                            onChange={(event) => {
                              const value = event.target.value;
                              setDraftNamesById((prev) => ({ ...prev, [category.id]: value }));
                              setRowErrorById((prev) => {
                                if (!prev[category.id]) return prev;
                                const next = { ...prev };
                                delete next[category.id];
                                return next;
                              });
                            }}
                            onBlur={() => {
                              void handleRename(category.id, category.name);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleRename(category.id, category.name);
                              }
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                setDraftNamesById((prev) => {
                                  if (!prev[category.id]) return prev;
                                  const next = { ...prev };
                                  delete next[category.id];
                                  return next;
                                });
                                setRowErrorById((prev) => {
                                  if (!prev[category.id]) return prev;
                                  const next = { ...prev };
                                  delete next[category.id];
                                  return next;
                                });
                              }
                            }}
                            disabled={isBusy}
                          />
                          {rowErrorById[category.id] ? (
                            <p className="mt-1 text-xs text-destructive">{rowErrorById[category.id]}</p>
                          ) : null}
                        </div>

                        <div className="mt-0.5 flex shrink-0 items-center gap-2">
                          <Badge
                            variant="secondary"
                            className="h-6 min-w-10 justify-center px-2 text-[11px] font-semibold tabular-nums"
                            title={`${feedCount} 个订阅源`}
                          >
                            {feedCount}
                          </Badge>
                          {isBusy ? (
                            <Loader2 size={16} className="animate-spin text-muted-foreground" aria-label="row-loading" />
                          ) : null}
                          <Button
                            type="button"
                            aria-label={`删除分类-${index}`}
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setConfirmDeleteId(category.id)}
                            disabled={isBusy}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      <AlertDialog
        open={Boolean(confirmDeleteId)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeleteCategory ? `确定删除「${confirmDeleteCategory.name}」？` : '确定删除该分类？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            删除分类不会删除订阅源，订阅源会自动归并到“未分类”。
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (!confirmDeleteId) return;
                  void handleDelete(confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
              >
                删除
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
