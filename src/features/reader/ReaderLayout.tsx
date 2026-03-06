import { Settings as SettingsIcon } from 'lucide-react';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import ArticleList from '../articles/ArticleList';
import ArticleView from '../articles/ArticleView';
import FeedList from '../feeds/FeedList';
import ResizeHandle from './ResizeHandle';
import SettingsCenterModal from '../settings/SettingsCenterModal';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  normalizeReaderPaneWidth,
  READER_LEFT_PANE_MAX_WIDTH,
  READER_LEFT_PANE_MIN_WIDTH,
  READER_MIDDLE_PANE_MAX_WIDTH,
  READER_MIDDLE_PANE_MIN_WIDTH,
  READER_RESIZE_DESKTOP_MIN_WIDTH,
  READER_RIGHT_PANE_MIN_WIDTH,
} from './readerLayoutSizing';

type ResizeTarget = 'left' | 'middle';

const MemoizedFeedList = memo(FeedList);
const MemoizedArticleList = memo(ArticleList);
const MemoizedArticleView = memo(ArticleView);

export default function ReaderLayout() {
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const selectedView = useAppStore((state) => state.selectedView);
  const selectedArticleId = useAppStore((state) => state.selectedArticleId);
  const general = useSettingsStore((state) => state.persistedSettings.general);
  const updateReaderLayoutSettings = useSettingsStore((state) => state.updateReaderLayoutSettings);
  const selectedArticleTitle = useAppStore(
    (state) => state.articles.find((article) => article.id === state.selectedArticleId)?.title ?? '',
  );
  const selectedArticleLink = useAppStore(
    (state) => state.articles.find((article) => article.id === state.selectedArticleId)?.link ?? '',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [articleTitleVisible, setArticleTitleVisible] = useState(true);
  const [liveLeftPaneWidth, setLiveLeftPaneWidth] = useState(general.leftPaneWidth);
  const [liveMiddlePaneWidth, setLiveMiddlePaneWidth] = useState(general.middlePaneWidth);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH,
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

  const leftPaneWidth = sidebarCollapsed ? 0 : liveLeftPaneWidth;
  const middlePaneWidth = liveMiddlePaneWidth;

  useEffect(() => {
    setLiveLeftPaneWidth(general.leftPaneWidth);
    liveLeftPaneWidthRef.current = general.leftPaneWidth;
  }, [general.leftPaneWidth]);

  useEffect(() => {
    setLiveMiddlePaneWidth(general.middlePaneWidth);
    liveMiddlePaneWidthRef.current = general.middlePaneWidth;
  }, [general.middlePaneWidth]);

  const stopDragging = () => {
    dragStateRef.current = null;
    setDraggingTarget(null);
    setVisibleResizeTarget(null);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  };

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handlePointerMove = (event: PointerEvent) => {
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
  };

  const handlePointerUp = () => {
    if (dragStateRef.current?.target === 'left') {
      updateReaderLayoutSettings({ leftPaneWidth: liveLeftPaneWidthRef.current });
    }

    if (dragStateRef.current?.target === 'middle') {
      updateReaderLayoutSettings({ middlePaneWidth: liveMiddlePaneWidthRef.current });
    }

    stopDragging();
  };

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
    dragStateRef.current = {
      target: 'left',
      startX: event.clientX,
      startLeftPaneWidth: liveLeftPaneWidthRef.current,
      startMiddlePaneWidth: liveMiddlePaneWidthRef.current,
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
    dragStateRef.current = {
      target: 'middle',
      startX: event.clientX,
      startLeftPaneWidth: liveLeftPaneWidthRef.current,
      startMiddlePaneWidth: liveMiddlePaneWidthRef.current,
    };
    setDraggingTarget('middle');
    setVisibleResizeTarget('middle');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });
  };

  const showFloatingArticleTitle = Boolean(
    selectedArticleId && selectedArticleTitle && !articleTitleVisible,
  );

  const floatingTitleBaseClassName =
    'absolute left-6 top-6 z-40 max-w-[calc(100%-8rem)] -translate-y-1/2 truncate rounded-md bg-background/90 px-3 py-1 text-lg font-semibold tracking-tight text-foreground/95 backdrop-blur-sm';

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
      className="relative flex h-screen overflow-hidden bg-background text-foreground"
    >
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

      {isDesktop ? (
        <ResizeHandle
          testId="reader-resize-handle-left"
          active={isResizeTargetActive('left')}
          onPointerDown={startLeftResize}
          onPointerEnter={() => handleResizeHandleEnter('left')}
          onPointerLeave={() => handleResizeHandleLeave('left')}
        />
      ) : null}

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

      {isDesktop ? (
        <ResizeHandle
          testId="reader-resize-handle-middle"
          active={isResizeTargetActive('middle')}
          onPointerDown={startMiddleResize}
          onPointerEnter={() => handleResizeHandleEnter('middle')}
          onPointerLeave={() => handleResizeHandleLeave('middle')}
        />
      ) : null}

      <div className="relative flex-1 overflow-hidden bg-background">
        <MemoizedArticleView onTitleVisibilityChange={setArticleTitleVisible} />

        {floatingTitle}
      </div>

      <Button
        onClick={() => setSettingsOpen(true)}
        type="button"
        variant="outline"
        size="icon"
        className="absolute right-4 top-6 z-40 -translate-y-1/2 bg-background/90 backdrop-blur-sm"
        aria-label="open-settings"
      >
        <SettingsIcon />
      </Button>

      {settingsOpen && <SettingsCenterModal onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
