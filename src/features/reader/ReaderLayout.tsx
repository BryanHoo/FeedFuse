import dynamic from 'next/dynamic';
import { ChevronLeft, PanelLeft, Search, Settings as SettingsIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import ArticleList from '../articles/ArticleList';
import ArticleView from '../articles/ArticleView';
import FeedList from '../feeds/FeedList';
import ResizeHandle from './ResizeHandle';
import GlobalSearchDialog from './GlobalSearchDialog';
import { getSelectedArticleFromState, useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ViewType } from '../../types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  FROSTED_HEADER_CLASS_NAME,
  READER_FEED_DRAWER_SHEET_CLASS_NAME,
  READER_TABLET_ARTICLE_PANE_CLASS_NAME,
} from '@/lib/designSystem';
import { cn } from '@/lib/utils';
import {
  normalizeReaderPaneWidth,
  READER_LEFT_PANE_MAX_WIDTH,
  READER_LEFT_PANE_MIN_WIDTH,
  READER_MIDDLE_PANE_MAX_WIDTH,
  READER_MIDDLE_PANE_MIN_WIDTH,
  READER_RESIZE_DESKTOP_MIN_WIDTH,
  READER_RIGHT_PANE_MIN_WIDTH,
  READER_TABLET_MIN_WIDTH,
} from './readerLayoutSizing';

type ResizeTarget = 'left' | 'middle';
const LEFT_RESIZE_PREVIEW_OFFSET_VARIABLE = '--reader-left-resize-preview-offset';
const MIDDLE_RESIZE_PREVIEW_OFFSET_VARIABLE = '--reader-middle-resize-preview-offset';
const MOBILE_SMART_VIEW_LABELS: Record<string, string> = {
  all: '全部文章',
  unread: '未读文章',
  starred: '收藏文章',
  'ai-digest': '智能报告',
};
const GLOBAL_SEARCH_SHORTCUT_KEY = 'f';

function isEditableShortcutTarget(target: EventTarget | null) {
  let currentNode = target instanceof Node ? target : null;

  while (currentNode) {
    if (currentNode instanceof HTMLElement) {
      const contentEditable = currentNode.getAttribute('contenteditable');
      if (
        currentNode.isContentEditable ||
        currentNode.contentEditable === 'true' ||
        currentNode.contentEditable === 'plaintext-only' ||
        contentEditable === '' ||
        contentEditable === 'true' ||
        currentNode.tagName === 'INPUT' ||
        currentNode.tagName === 'TEXTAREA' ||
        currentNode.tagName === 'SELECT'
      ) {
        return true;
      }
    }

    currentNode = currentNode.parentNode;
  }

  return false;
}

const MemoizedFeedList = memo(FeedList);
const MemoizedArticleList = memo(ArticleList);
const MemoizedArticleView = memo(ArticleView);
const SettingsCenterModal = dynamic(() => import('../settings/SettingsCenterModal'), {
  ssr: false,
  loading: () => null,
});

interface ReaderLayoutProps {
  renderedAt?: string;
  initialSelectedView?: ViewType;
}

export default function ReaderLayout({ renderedAt, initialSelectedView }: ReaderLayoutProps = {}) {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const selectedView = useAppStore((state) => state.selectedView);
  const selectedArticleId = useAppStore((state) => state.selectedArticleId);
  const setSelectedArticle = useAppStore((state) => state.setSelectedArticle);
  const general = useSettingsStore((state) => state.persistedSettings.general);
  const updateReaderLayoutSettings = useSettingsStore((state) => state.updateReaderLayoutSettings);
  const selectedArticleTitle = useAppStore(
    (state) => getSelectedArticleFromState(state)?.title ?? '',
  );
  const selectedViewLabel = useAppStore((state) => {
    if (MOBILE_SMART_VIEW_LABELS[state.selectedView]) {
      return MOBILE_SMART_VIEW_LABELS[state.selectedView];
    }

    return state.feeds.find((feed) => feed.id === state.selectedView)?.title ?? '订阅视图';
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchHighlightQuery, setActiveSearchHighlightQuery] = useState('');
  const selectionKey = `${selectedView}:${selectedArticleId ?? ''}`;
  const [feedSheetState, setFeedSheetState] = useState(() => ({
    open: false,
    selectionKey,
  }));
  const [viewportWidth, setViewportWidth] = useState<number>(READER_RESIZE_DESKTOP_MIN_WIDTH);
  const [visibleResizeTarget, setVisibleResizeTarget] = useState<ResizeTarget | null>(null);
  const [draggingTarget, setDraggingTarget] = useState<ResizeTarget | null>(null);
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const liveLeftPaneWidthRef = useRef(general.leftPaneWidth);
  const liveMiddlePaneWidthRef = useRef(general.middlePaneWidth);
  const dragStateRef = useRef<
    | {
        target: ResizeTarget;
        startX: number;
        startLeftPaneWidth: number;
        startMiddlePaneWidth: number;
      }
    | null
  >(null);

  const isDesktop = viewportWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH;
  const isTablet =
    viewportWidth >= READER_TABLET_MIN_WIDTH && viewportWidth < READER_RESIZE_DESKTOP_MIN_WIDTH;
  const isMobile = viewportWidth < READER_TABLET_MIN_WIDTH;
  const feedSheetOpen = !isDesktop && feedSheetState.open && feedSheetState.selectionKey === selectionKey;
  const leftPaneWidth = sidebarCollapsed ? 0 : general.leftPaneWidth;
  const middlePaneWidth = general.middlePaneWidth;
  const mobileHeading = selectedArticleId ? selectedArticleTitle || '阅读文章' : selectedViewLabel;
  const mobileSurfaceClassName = cn(
    'overflow-hidden border border-border/60 bg-[color-mix(in_oklab,var(--color-background)_86%,white_14%)] shadow-none supports-[backdrop-filter]:bg-[color-mix(in_oklab,var(--color-background)_78%,white_22%)]',
    'dark:border-white/[0.06] dark:bg-[linear-gradient(180deg,rgba(15,15,19,0.94),rgba(9,9,12,0.9))] dark:supports-[backdrop-filter]:bg-[linear-gradient(180deg,rgba(15,15,19,0.84),rgba(9,9,12,0.78))]',
  );

  const setResizePreviewOffset = useCallback((target: ResizeTarget, offset: number) => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    layout.style.setProperty(
      target === 'left'
        ? LEFT_RESIZE_PREVIEW_OFFSET_VARIABLE
        : MIDDLE_RESIZE_PREVIEW_OFFSET_VARIABLE,
      `${offset}px`,
    );
  }, []);

  const resetResizePreviewOffsets = useCallback(() => {
    const layout = layoutRef.current;
    if (!layout) {
      return;
    }

    layout.style.setProperty(LEFT_RESIZE_PREVIEW_OFFSET_VARIABLE, '0px');
    layout.style.setProperty(MIDDLE_RESIZE_PREVIEW_OFFSET_VARIABLE, '0px');
  }, []);

  const clearDraggingState = useCallback(() => {
    dragStateRef.current = null;
    setDraggingTarget(null);
    setVisibleResizeTarget(null);
    resetResizePreviewOffsets();
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [resetResizePreviewOffsets]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      if (dragState.target === 'left') {
        const nextWidth = normalizeReaderPaneWidth(
          dragState.startLeftPaneWidth + (event.clientX - dragState.startX),
          dragState.startLeftPaneWidth,
          READER_LEFT_PANE_MIN_WIDTH,
          READER_LEFT_PANE_MAX_WIDTH,
        );

        liveLeftPaneWidthRef.current = nextWidth;
        setResizePreviewOffset('left', nextWidth - dragState.startLeftPaneWidth);
        return;
      }

      const layoutWidth = layoutRef.current?.clientWidth ?? 0;
      const effectiveLeftPaneWidth = sidebarCollapsed ? 0 : liveLeftPaneWidthRef.current;
      const maxMiddlePaneWidth = Math.min(
        READER_MIDDLE_PANE_MAX_WIDTH,
        Math.max(
          READER_MIDDLE_PANE_MIN_WIDTH,
          layoutWidth - effectiveLeftPaneWidth - READER_RIGHT_PANE_MIN_WIDTH,
        ),
      );
      const nextWidth = normalizeReaderPaneWidth(
        dragState.startMiddlePaneWidth + (event.clientX - dragState.startX),
        dragState.startMiddlePaneWidth,
        READER_MIDDLE_PANE_MIN_WIDTH,
        maxMiddlePaneWidth,
      );

      liveMiddlePaneWidthRef.current = nextWidth;
      setResizePreviewOffset('middle', nextWidth - dragState.startMiddlePaneWidth);
    },
    [setResizePreviewOffset, sidebarCollapsed],
  );

  const handlePointerUp = useCallback(() => {
    const dragState = dragStateRef.current;

    if (dragState?.target === 'left') {
      updateReaderLayoutSettings({ leftPaneWidth: liveLeftPaneWidthRef.current });
    }

    if (dragState?.target === 'middle') {
      updateReaderLayoutSettings({ middlePaneWidth: liveMiddlePaneWidthRef.current });
    }

    window.removeEventListener('pointermove', handlePointerMove);
    clearDraggingState();
  }, [clearDraggingState, handlePointerMove, updateReaderLayoutSettings]);

  useLayoutEffect(() => {
    const handleResize = () => {
      const nextWidth = window.innerWidth;
      setViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));

      if (nextWidth < READER_RESIZE_DESKTOP_MIN_WIDTH) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        clearDraggingState();
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [clearDraggingState, handlePointerMove, handlePointerUp]);

  useEffect(() => {
    // Reader-level shortcuts live here because this layout owns the search dialog state.
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.shiftKey) {
        return;
      }

      if ((!event.metaKey && !event.ctrlKey) || event.key.toLowerCase() !== GLOBAL_SEARCH_SHORTCUT_KEY) {
        return;
      }

      // Avoid stealing browser find shortcuts while the user is actively typing.
      if (isEditableShortcutTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setSearchOpen(true);
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => {
      window.removeEventListener('keydown', handleGlobalShortcuts);
    };
  }, []);

  const isResizeTargetActive = (target: ResizeTarget) => visibleResizeTarget === target;

  const handleResizeHandleEnter = (target: ResizeTarget) => {
    if (draggingTarget !== null) {
      return;
    }

    setVisibleResizeTarget(target);
  };

  const handleResizeHandleLeave = (target: ResizeTarget) => {
    if (draggingTarget !== null) {
      return;
    }

    setVisibleResizeTarget((current) => (current === target ? null : current));
  };

  const startLeftResize: React.PointerEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    resetResizePreviewOffsets();
    liveLeftPaneWidthRef.current = general.leftPaneWidth;
    liveMiddlePaneWidthRef.current = general.middlePaneWidth;
    dragStateRef.current = {
      target: 'left',
      startX: event.clientX,
      startLeftPaneWidth: general.leftPaneWidth,
      startMiddlePaneWidth: general.middlePaneWidth,
    };
    setDraggingTarget('left');
    setVisibleResizeTarget('left');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const startMiddleResize: React.PointerEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    resetResizePreviewOffsets();
    liveLeftPaneWidthRef.current = general.leftPaneWidth;
    liveMiddlePaneWidthRef.current = general.middlePaneWidth;
    dragStateRef.current = {
      target: 'middle',
      startX: event.clientX,
      startLeftPaneWidth: general.leftPaneWidth,
      startMiddlePaneWidth: general.middlePaneWidth,
    };
    setDraggingTarget('middle');
    setVisibleResizeTarget('middle');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  return (
    <div
      ref={layoutRef}
      data-testid="reader-layout-root"
      className={cn(
        'relative flex h-screen overflow-hidden bg-background text-foreground dark:bg-[radial-gradient(ellipse_at_top,rgba(15,15,22,0.98)_0%,rgba(7,7,10,0.98)_48%,rgba(2,2,3,1)_100%)]',
        !isDesktop && 'flex-col',
      )}
    >
      {isDesktop ? (
        <>
          <div
            data-testid="reader-feed-pane"
            className={cn(
              'shrink-0 overflow-hidden border-r bg-muted/55 transition-colors duration-200 dark:border-white/[0.05] dark:bg-[linear-gradient(180deg,rgba(14,14,18,0.96),rgba(9,9,12,0.94))]',
              isResizeTargetActive('left') ? 'border-primary/60' : 'border-border',
            )}
            style={{ width: `${leftPaneWidth}px` }}
          >
            <MemoizedFeedList initialSelectedView={initialSelectedView} />
          </div>

          <ResizeHandle
            testId="reader-resize-handle-left"
            active={isResizeTargetActive('left')}
            dragging={draggingTarget === 'left'}
            previewOffsetVariable={LEFT_RESIZE_PREVIEW_OFFSET_VARIABLE}
            onPointerDown={startLeftResize}
            onPointerEnter={() => handleResizeHandleEnter('left')}
            onPointerLeave={() => handleResizeHandleLeave('left')}
          />

          <div
            data-testid="reader-article-pane"
            className={cn(
              'shrink-0 border-r bg-muted/15 transition-colors duration-200 dark:border-white/[0.05] dark:bg-[linear-gradient(180deg,rgba(11,11,15,0.94),rgba(7,7,10,0.9))]',
              isResizeTargetActive('middle') ? 'border-primary/60' : 'border-border',
            )}
            style={{ width: `${middlePaneWidth}px` }}
          >
            <MemoizedArticleList
              key={selectedView}
              renderedAt={renderedAt}
              initialSelectedView={initialSelectedView}
            />
          </div>

          <ResizeHandle
            testId="reader-resize-handle-middle"
            active={isResizeTargetActive('middle')}
            dragging={draggingTarget === 'middle'}
            previewOffsetVariable={MIDDLE_RESIZE_PREVIEW_OFFSET_VARIABLE}
            onPointerDown={startMiddleResize}
            onPointerEnter={() => handleResizeHandleEnter('middle')}
            onPointerLeave={() => handleResizeHandleLeave('middle')}
          />

          <div className="relative flex-1 overflow-hidden bg-background dark:bg-[radial-gradient(circle_at_top,rgba(94,106,210,0.09),transparent_26%),linear-gradient(180deg,rgba(8,8,11,0.95),rgba(3,3,4,1))]">
            <MemoizedArticleView
              renderedAt={renderedAt}
              highlightQuery={activeSearchHighlightQuery}
              onOpenSearch={() => setSearchOpen(true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(74,107,255,0.14),transparent_72%)] dark:bg-[radial-gradient(circle_at_top,rgba(94,106,210,0.2),transparent_72%)]" />

            <div className="relative flex h-full min-h-0 flex-col">
              <div
                data-testid="reader-non-desktop-topbar"
                className={cn(
                  'flex h-14 shrink-0 items-center gap-2 border-b px-2.5 sm:px-3',
                  FROSTED_HEADER_CLASS_NAME,
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={isMobile && selectedArticleId ? '返回文章列表' : '打开订阅源列表'}
                  className="h-9 w-9 shrink-0 rounded-full"
                  onClick={() => {
                    if (isMobile && selectedArticleId) {
                      setSelectedArticle(null);
                      return;
                    }

                    setFeedSheetState({
                      open: true,
                      selectionKey,
                    });
                  }}
                >
                  {isMobile && selectedArticleId ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <PanelLeft className="h-4 w-4" />
                  )}
                </Button>

                <div className="min-w-0 flex-1 px-1 text-center">
                  <h1 className="truncate text-sm font-semibold text-foreground sm:text-[15px]">
                    {mobileHeading}
                  </h1>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="打开全局搜索"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="打开设置"
                    className="h-9 w-9 rounded-full"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <SettingsIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {isTablet ? (
                <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3 pt-3 sm:px-4 sm:pb-4">
                  <div
                    data-testid="reader-tablet-article-pane"
                    className={cn(
                      READER_TABLET_ARTICLE_PANE_CLASS_NAME,
                      'overflow-hidden rounded-[1.5rem] border border-border/70 shadow-none',
                    )}
                  >
                    <MemoizedArticleList
                      key={selectedView}
                      renderedAt={renderedAt}
                      initialSelectedView={initialSelectedView}
                    />
                  </div>

                  <div
                    className={cn(
                      'relative min-w-0 flex-1 rounded-[1.5rem]',
                      mobileSurfaceClassName,
                    )}
                  >
                    <MemoizedArticleView
                      renderedAt={renderedAt}
                      highlightQuery={activeSearchHighlightQuery}
                      reserveTopSpace={false}
                    />
                  </div>
                </div>
              ) : (
                <div
                  data-testid="reader-mobile-layout"
                  className="relative min-h-0 flex-1 overflow-hidden"
                >
                  <div
                    className={cn(
                      'h-full min-h-0 bg-background/96 dark:bg-[linear-gradient(180deg,rgba(10,10,14,0.96),rgba(6,6,9,0.98))]',
                      selectedArticleId
                        ? 'rounded-none'
                        : 'rounded-t-[1.35rem] border-t border-border/60 dark:border-white/[0.05]',
                    )}
                  >
                    {selectedArticleId ? (
                      <MemoizedArticleView
                        renderedAt={renderedAt}
                        highlightQuery={activeSearchHighlightQuery}
                        reserveTopSpace={false}
                      />
                    ) : (
                      <MemoizedArticleList
                        key={selectedView}
                        renderedAt={renderedAt}
                        initialSelectedView={initialSelectedView}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!isDesktop ? (
        <Sheet
          open={feedSheetOpen}
          onOpenChange={(open) =>
            setFeedSheetState((currentState) => ({
              ...currentState,
              open,
            }))
          }
        >
          <SheetContent
            side="left"
            className={READER_FEED_DRAWER_SHEET_CLASS_NAME}
            data-testid="reader-feed-drawer"
            closeLabel="关闭订阅源列表"
            overlayProps={{ 'data-testid': 'reader-feed-drawer-overlay' }}
          >
            <SheetTitle className="sr-only">导航与 RSS 源</SheetTitle>
            <SheetDescription className="sr-only">切换视图、分类和 RSS 源</SheetDescription>
            <MemoizedFeedList
              initialSelectedView={initialSelectedView}
              reserveCloseButtonSpace
            />
          </SheetContent>
        </Sheet>
      ) : null}

      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectResult={async (result, query) => {
          setActiveSearchHighlightQuery(query);
          await useAppStore.getState().openArticleInReader({
            view: result.feedId,
            articleId: result.id,
            articleHistory: 'push',
          });
        }}
      />

      {settingsOpen && <SettingsCenterModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
