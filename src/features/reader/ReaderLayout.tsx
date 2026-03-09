import dynamic from 'next/dynamic';
import { ChevronLeft, PanelLeft, Settings as SettingsIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import ArticleList from '../articles/ArticleList';
import ArticleView from '../articles/ArticleView';
import FeedList from '../feeds/FeedList';
import ResizeHandle from './ResizeHandle';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import {
  FLOATING_SURFACE_CLASS_NAME,
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

const MemoizedFeedList = memo(FeedList);
const MemoizedArticleList = memo(ArticleList);
const MemoizedArticleView = memo(ArticleView);
const SettingsCenterModal = dynamic(() => import('../settings/SettingsCenterModal'), {
  ssr: false,
  loading: () => null,
});

export default function ReaderLayout() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const selectedView = useAppStore((state) => state.selectedView);
  const selectedArticleId = useAppStore((state) => state.selectedArticleId);
  const setSelectedArticle = useAppStore((state) => state.setSelectedArticle);
  const general = useSettingsStore((state) => state.persistedSettings.general);
  const updateReaderLayoutSettings = useSettingsStore((state) => state.updateReaderLayoutSettings);
  const selectedArticleTitle = useAppStore(
    (state) => state.articles.find((article) => article.id === state.selectedArticleId)?.title ?? '',
  );
  const selectedArticleLink = useAppStore(
    (state) => state.articles.find((article) => article.id === state.selectedArticleId)?.link ?? '',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const selectionKey = `${selectedView}:${selectedArticleId ?? ''}`;
  const [feedSheetState, setFeedSheetState] = useState(() => ({
    open: false,
    selectionKey,
  }));
  const [articleTitleVisible, setArticleTitleVisible] = useState(true);
  const [liveLeftPaneWidth, setLiveLeftPaneWidth] = useState<number | null>(null);
  const [liveMiddlePaneWidth, setLiveMiddlePaneWidth] = useState<number | null>(null);
  const [viewportWidth, setViewportWidth] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth : READER_RESIZE_DESKTOP_MIN_WIDTH,
  );
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
  const resolvedLeftPaneWidth = liveLeftPaneWidth ?? general.leftPaneWidth;
  const resolvedMiddlePaneWidth = liveMiddlePaneWidth ?? general.middlePaneWidth;

  const leftPaneWidth = sidebarCollapsed ? 0 : resolvedLeftPaneWidth;
  const middlePaneWidth = resolvedMiddlePaneWidth;

  const clearDraggingState = useCallback(() => {
    dragStateRef.current = null;
    setDraggingTarget(null);
    setVisibleResizeTarget(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

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
        setLiveLeftPaneWidth(nextWidth);
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
      setLiveMiddlePaneWidth(nextWidth);
    },
    [sidebarCollapsed],
  );

  const handlePointerUp = useCallback(() => {
    if (dragStateRef.current?.target === 'left') {
      updateReaderLayoutSettings({ leftPaneWidth: liveLeftPaneWidthRef.current });
    }

    if (dragStateRef.current?.target === 'middle') {
      updateReaderLayoutSettings({ middlePaneWidth: liveMiddlePaneWidthRef.current });
    }

    window.removeEventListener('pointermove', handlePointerMove);
    setLiveLeftPaneWidth(null);
    setLiveMiddlePaneWidth(null);
    clearDraggingState();
  }, [clearDraggingState, handlePointerMove, updateReaderLayoutSettings]);

  useEffect(() => {
    const handleResize = () => {
      const nextWidth = window.innerWidth;
      setViewportWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));

      if (nextWidth < READER_RESIZE_DESKTOP_MIN_WIDTH) {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        setLiveLeftPaneWidth(null);
        setLiveMiddlePaneWidth(null);
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
    liveLeftPaneWidthRef.current = resolvedLeftPaneWidth;
    liveMiddlePaneWidthRef.current = resolvedMiddlePaneWidth;
    dragStateRef.current = {
      target: 'left',
      startX: event.clientX,
      startLeftPaneWidth: resolvedLeftPaneWidth,
      startMiddlePaneWidth: resolvedMiddlePaneWidth,
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
    liveLeftPaneWidthRef.current = resolvedLeftPaneWidth;
    liveMiddlePaneWidthRef.current = resolvedMiddlePaneWidth;
    dragStateRef.current = {
      target: 'middle',
      startX: event.clientX,
      startLeftPaneWidth: resolvedLeftPaneWidth,
      startMiddlePaneWidth: resolvedMiddlePaneWidth,
    };
    setDraggingTarget('middle');
    setVisibleResizeTarget('middle');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const showFloatingArticleTitle = Boolean(
    !isMobile && selectedArticleId && selectedArticleTitle && !articleTitleVisible,
  );

  const floatingTitleBaseClassName = cn(
    'absolute z-40 truncate rounded-md px-3 py-1 font-semibold tracking-tight text-foreground/95',
    FLOATING_SURFACE_CLASS_NAME,
    isDesktop
      ? 'left-6 top-6 max-w-[calc(100%-8rem)] -translate-y-1/2 text-lg'
      : 'left-16 right-16 top-3 text-base',
  );

  let floatingTitle: ReactNode = null;
  if (showFloatingArticleTitle) {
    floatingTitle = selectedArticleLink ? (
      <a
        className={cn(
          floatingTitleBaseClassName,
          'underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
        title={selectedArticleTitle}
        data-testid="reader-floating-title"
        href={selectedArticleLink}
        target="_blank"
        rel="noopener noreferrer"
      >
        {selectedArticleTitle}
      </a>
    ) : (
      <div
        className={cn('pointer-events-none', floatingTitleBaseClassName)}
        title={selectedArticleTitle}
        data-testid="reader-floating-title"
      >
        {selectedArticleTitle}
      </div>
    );
  }

  return (
    <div
      ref={layoutRef}
      data-testid="reader-layout-root"
      className={cn(
        'relative flex h-screen overflow-hidden bg-background text-foreground',
        !isDesktop && 'flex-col',
      )}
    >
      {isDesktop ? (
        <>
          <div
            data-testid="reader-feed-pane"
            className={cn(
              'shrink-0 overflow-hidden border-r bg-muted/45',
              isResizeTargetActive('left') ? 'border-primary/60' : 'border-border',
              draggingTarget === 'left' ? 'transition-none' : 'transition-[width] duration-300',
            )}
            style={{ width: `${leftPaneWidth}px` }}
          >
            <MemoizedFeedList />
          </div>

          <ResizeHandle
            testId="reader-resize-handle-left"
            active={isResizeTargetActive('left')}
            onPointerDown={startLeftResize}
            onPointerEnter={() => handleResizeHandleEnter('left')}
            onPointerLeave={() => handleResizeHandleLeave('left')}
          />

          <div
            data-testid="reader-article-pane"
            className={cn(
              'shrink-0 border-r bg-muted/5',
              isResizeTargetActive('middle') ? 'border-primary/60' : 'border-border',
            )}
            style={{ width: `${middlePaneWidth}px` }}
          >
            <MemoizedArticleList key={selectedView} />
          </div>

          <ResizeHandle
            testId="reader-resize-handle-middle"
            active={isResizeTargetActive('middle')}
            onPointerDown={startMiddleResize}
            onPointerEnter={() => handleResizeHandleEnter('middle')}
            onPointerLeave={() => handleResizeHandleLeave('middle')}
          />

          <div className="relative flex-1 overflow-hidden bg-background">
            <MemoizedArticleView onTitleVisibilityChange={setArticleTitleVisible} />

            {floatingTitle}
          </div>
        </>
      ) : (
        <>
          <div
            data-testid="reader-non-desktop-topbar"
            className={cn('flex h-14 shrink-0 items-center justify-between px-3', FROSTED_HEADER_CLASS_NAME)}
          >
            <div className="flex min-w-0 items-center gap-2">
              {isMobile && selectedArticleId ? (
                <Button
                  onClick={() => setSelectedArticle(null)}
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="back-to-articles"
                >
                  <ChevronLeft />
                </Button>
              ) : null}

              <Button
                onClick={() =>
                  setFeedSheetState({
                    open: true,
                    selectionKey,
                  })
                }
                type="button"
                variant="outline"
                size="icon"
                aria-label="open-feeds"
              >
                <PanelLeft />
              </Button>
            </div>

            <div className="min-w-0 flex-1 px-3 text-center text-sm font-medium text-muted-foreground">
              <span className="block truncate">{selectedArticleId ? selectedArticleTitle || '阅读文章' : 'FeedFuse'}</span>
            </div>

            <Button
              onClick={() => setSettingsOpen(true)}
              type="button"
              variant="outline"
              size="icon"
              aria-label="open-settings"
            >
              <SettingsIcon />
            </Button>
          </div>

          {isTablet ? (
            <div className="flex min-h-0 flex-1">
              <div
                data-testid="reader-tablet-article-pane"
                className={READER_TABLET_ARTICLE_PANE_CLASS_NAME}
              >
                <MemoizedArticleList key={selectedView} />
              </div>

              <div className="relative min-w-0 flex-1 overflow-hidden bg-background">
                <MemoizedArticleView
                  onTitleVisibilityChange={setArticleTitleVisible}
                  reserveTopSpace={false}
                />

                {floatingTitle}
              </div>
            </div>
          ) : (
            <div
              data-testid="reader-mobile-layout"
              className="relative min-h-0 flex-1 overflow-hidden bg-background"
            >
              {selectedArticleId ? (
                <MemoizedArticleView
                  onTitleVisibilityChange={setArticleTitleVisible}
                  reserveTopSpace={false}
                />
              ) : (
                <MemoizedArticleList key={selectedView} />
              )}
            </div>
          )}
        </>
      )}

      {isDesktop ? (
        <Button
          onClick={() => setSettingsOpen(true)}
          type="button"
          variant="outline"
          size="icon"
          className={cn('absolute right-4 top-6 z-40 -translate-y-1/2', FLOATING_SURFACE_CLASS_NAME)}
          aria-label="open-settings"
        >
          <SettingsIcon />
        </Button>
      ) : null}

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
            closeLabel="close-feeds"
            overlayProps={{ 'data-testid': 'reader-feed-drawer-overlay' }}
          >
            <SheetTitle className="sr-only">导航与 RSS 源</SheetTitle>
            <SheetDescription className="sr-only">切换视图、分类和 RSS 源</SheetDescription>
            <MemoizedFeedList reserveCloseButtonSpace />
          </SheetContent>
        </Sheet>
      ) : null}

      {settingsOpen && <SettingsCenterModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
