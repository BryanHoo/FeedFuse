'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Category, Feed } from '../../types';
import {
  buildAiDigestSourceTreeData,
  computeVisibleTagCount,
  filterAiDigestSourceTreeData,
  getCategorySelectionState,
  sanitizeSelectedFeedIds,
  toggleCategorySelection,
  toggleFeedSelection,
  type CategorySelectionState,
} from './aiDigestSourceTree.utils';

interface AiDigestSourceTreeSelectProps {
  categories: Category[];
  feeds: Feed[];
  selectedFeedIds: string[];
  onChange: (nextSelectedFeedIds: string[]) => void;
  error?: string | null;
}

interface TriStateCheckboxProps {
  id: string;
  state: CategorySelectionState;
  label: string;
  onChange: (checked: boolean) => void;
}

const TAG_MAX_WIDTH = 144;
const TAG_GAP = 6;
const SUFFIX_WIDTH = 28;
const BUTTON_RESERVED_WIDTH = 32;

function TriStateCheckbox({ id, state, label, onChange }: TriStateCheckboxProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = state === 'indeterminate';
  }, [state]);

  return (
    <input
      ref={inputRef}
      id={id}
      type="checkbox"
      aria-label={label}
      checked={state === 'checked'}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

export default function AiDigestSourceTreeSelect({
  categories,
  feeds,
  selectedFeedIds,
  onChange,
  error,
}: AiDigestSourceTreeSelectProps) {
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const triggerMetaRef = useRef<HTMLSpanElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);
  const [triggerMetrics, setTriggerMetrics] = useState({
    triggerWidth: 0,
    rightSectionWidth: 0,
  });
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedByCategoryId, setExpandedByCategoryId] = useState<Record<string, boolean>>({});
  const treeData = useMemo(() => buildAiDigestSourceTreeData({ categories, feeds }), [categories, feeds]);
  const normalizedSelectedFeedIds = useMemo(
    () => sanitizeSelectedFeedIds(selectedFeedIds),
    [selectedFeedIds],
  );
  const selectedFeedIdSet = useMemo(
    () => new Set(normalizedSelectedFeedIds),
    [normalizedSelectedFeedIds],
  );
  const filteredTreeData = useMemo(
    () => filterAiDigestSourceTreeData(treeData, searchQuery),
    [treeData, searchQuery],
  );
  const feedTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of treeData) {
      for (const feed of category.children) {
        map.set(feed.id, feed.title);
      }
    }
    return map;
  }, [treeData]);
  const selectedLabelItems = useMemo(
    () =>
      normalizedSelectedFeedIds.map((feedId) => ({
        id: feedId,
        label: feedTitleById.get(feedId) ?? feedId,
      })),
    [feedTitleById, normalizedSelectedFeedIds],
  );
  const visibleTagCount = useMemo(
    () =>
      computeVisibleTagCount({
        selectedCount: selectedLabelItems.length,
        containerWidth: triggerMetrics.triggerWidth,
        rightSectionWidth: triggerMetrics.rightSectionWidth + BUTTON_RESERVED_WIDTH,
        tagWidth: TAG_MAX_WIDTH,
        gap: TAG_GAP,
        suffixWidth: SUFFIX_WIDTH,
      }),
    [selectedLabelItems.length, triggerMetrics.rightSectionWidth, triggerMetrics.triggerWidth],
  );
  const visibleSelectedLabels = selectedLabelItems.slice(0, visibleTagCount);
  const hiddenSelectedCount = Math.max(0, selectedLabelItems.length - visibleSelectedLabels.length);

  useEffect(() => {
    if (!open) return;

    const timerId = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [open]);

  const disabled = treeData.length === 0;
  const placeholder = disabled ? '暂无可选 RSS 源' : '选择 RSS 来源';
  const forceExpanded = searchQuery.trim().length > 0;

  const syncTriggerMetrics = useCallback(() => {
    const nextTriggerWidth = triggerButtonRef.current?.clientWidth ?? 0;
    const nextRightSectionWidth = triggerMetaRef.current?.offsetWidth ?? 0;
    setTriggerMetrics((current) => {
      if (
        current.triggerWidth === nextTriggerWidth &&
        current.rightSectionWidth === nextRightSectionWidth
      ) {
        return current;
      }

      return {
        triggerWidth: nextTriggerWidth,
        rightSectionWidth: nextRightSectionWidth,
      };
    });
  }, []);

  const setTriggerButtonRef = useCallback((node: HTMLButtonElement | null) => {
    triggerButtonRef.current = node;
  }, []);

  const setTriggerMetaRef = useCallback((node: HTMLSpanElement | null) => {
    triggerMetaRef.current = node;
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      syncTriggerMetrics();
    });

    if (triggerButtonRef.current) {
      observer.observe(triggerButtonRef.current);
    }
    if (triggerMetaRef.current) {
      observer.observe(triggerMetaRef.current);
    }

    const rafId = window.requestAnimationFrame(() => {
      syncTriggerMetrics();
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [syncTriggerMetrics]);

  const handleToggleCategory = (categoryId: string) => {
    setExpandedByCategoryId((current) => ({
      ...current,
      [categoryId]: !(current[categoryId] ?? true),
    }));
  };

  const handleClearSelection = () => {
    onChange([]);
  };

  return (
    <Popover
      open={!disabled && open}
      onOpenChange={(nextOpen) => {
        if (disabled) {
          setOpen(false);
          return;
        }

        setOpen(nextOpen);
        if (nextOpen) {
          // Dialog 会通过 RemoveScroll 限制外部滚动，Portal 需要挂在 Dialog 内部才能保留滚轮。
          const nextContainer = triggerButtonRef.current?.closest('[role="dialog"]');
          setPortalContainer(nextContainer instanceof HTMLElement ? nextContainer : undefined);
          syncTriggerMetrics();
        }
        if (!nextOpen) {
          setSearchQuery('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={setTriggerButtonRef}
          type="button"
          aria-label="选择 RSS 来源"
          aria-invalid={error ? 'true' : 'false'}
          aria-expanded={!disabled && open}
          className={cn(
            'flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm transition-[border-color,box-shadow] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-destructive focus-visible:ring-destructive/40' : undefined,
          )}
          disabled={disabled}
        >
          {visibleSelectedLabels.length > 0 ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              {visibleSelectedLabels.map((label) => (
                <span
                  key={label.id}
                  className="inline-flex max-w-36 items-center rounded-sm bg-accent px-1.5 py-0.5 text-xs text-accent-foreground"
                >
                  <span className="truncate">{label.label}</span>
                </span>
              ))}
              {hiddenSelectedCount > 0 ? (
                <span className="text-xs text-muted-foreground">+{hiddenSelectedCount}</span>
              ) : null}
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <span
            ref={setTriggerMetaRef}
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
          >
            {normalizedSelectedFeedIds.length > 0 ? `${normalizedSelectedFeedIds.length} 项` : null}
            <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        container={portalContainer}
        className="z-[60] w-[var(--radix-popover-trigger-width)] p-0"
      >
        <div className="border-b border-border/70 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索来源或分类"
              className="h-8 pl-8 pr-8 text-xs"
              aria-label="搜索来源或分类"
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => setSearchQuery('')}
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto p-2">
          {filteredTreeData.length <= 0 ? (
            <div className="rounded-md border border-dashed border-border/70 px-3 py-5 text-center text-xs text-muted-foreground">
              没有匹配的来源
            </div>
          ) : (
            filteredTreeData.map((category) => {
              const categorySelectionState = getCategorySelectionState(category, selectedFeedIdSet);
              const categoryExpanded = forceExpanded ? true : (expandedByCategoryId[category.id] ?? true);
              const categoryCheckboxId = `ai-digest-source-category-${category.id}`;

              return (
                <section
                  key={category.id}
                  className="rounded-lg border border-border/60 bg-background/70 p-1.5"
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`${categoryExpanded ? '收起' : '展开'}分类 ${category.title}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/80 hover:text-accent-foreground"
                      onClick={() => handleToggleCategory(category.id)}
                    >
                      {categoryExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>

                    <TriStateCheckbox
                      id={categoryCheckboxId}
                      state={categorySelectionState}
                      label={`选择分类 ${category.title}`}
                      onChange={(checked) => {
                        onChange(toggleCategorySelection(normalizedSelectedFeedIds, category, checked));
                      }}
                    />

                    <label
                      htmlFor={categoryCheckboxId}
                      className="min-w-0 flex-1 cursor-pointer truncate text-sm font-medium"
                    >
                      {category.title}
                    </label>

                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {category.children.length}
                    </span>
                  </div>

                  {categoryExpanded ? (
                    <div className="ml-8 mt-1 space-y-1">
                      {category.children.map((feed) => {
                        const feedCheckboxId = `ai-digest-source-feed-${feed.id}`;
                        const feedChecked = selectedFeedIdSet.has(feed.id);

                        return (
                          <label
                            key={feed.id}
                            htmlFor={feedCheckboxId}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                              feedChecked
                                ? 'bg-accent text-accent-foreground'
                                : 'hover:bg-accent/60 hover:text-accent-foreground',
                            )}
                          >
                            <input
                              id={feedCheckboxId}
                              type="checkbox"
                              aria-label={`选择来源 ${feed.title}`}
                              checked={feedChecked}
                              onChange={(event) => {
                                onChange(
                                  toggleFeedSelection(
                                    normalizedSelectedFeedIds,
                                    feed.id,
                                    event.target.checked,
                                  ),
                                );
                              }}
                              className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                            <span className="truncate">{feed.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/70 px-2 py-1.5">
          <p className="text-xs text-muted-foreground">已选择 {normalizedSelectedFeedIds.length} 个来源</p>
          <button
            type="button"
            onClick={handleClearSelection}
            disabled={normalizedSelectedFeedIds.length <= 0}
            className="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            清空
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
