import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from 'react';
import { FileText, Languages, Settings as SettingsIcon, Sparkles, Star } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ArticleAiDigestSource } from '../../types';
import {
  enqueueArticleFulltext,
  getArticleTasks,
  type ArticleTasksDto,
} from '../../lib/apiClient';
import { pollWithBackoff } from '../../lib/polling';
import { useRenderTimeSnapshot } from '../../hooks/useRenderTimeSnapshot';
import { formatRelativeTime } from '../../utils/date';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useImmersiveTranslation } from './useImmersiveTranslation';
import { useAnimatedAiSummaryText } from './useAnimatedAiSummaryText';
import { useStreamingAiSummary } from './useStreamingAiSummary';
import { buildImmersiveHtml } from './immersiveRender';
import ArticleScrollAssist from './ArticleScrollAssist';
import ArticleImagePreview from './ArticleImagePreview';
import ReaderToolbarIconButton from '../reader/ReaderToolbarIconButton';
import { READER_RESIZE_DESKTOP_MIN_WIDTH } from '../reader/readerLayoutSizing';

const FLOATING_TITLE_SCROLL_THRESHOLD_PX = 96;

interface ArticleViewProps {
  onOpenSettings?: () => void;
  onTitleVisibilityChange?: (isVisible: boolean) => void;
  reserveTopSpace?: boolean;
  renderedAt?: string;
}

type ImagePreviewState = {
  articleId: string | null;
  previewId: number;
  src: string;
  alt: string;
};

export default function ArticleView({
  onOpenSettings,
  onTitleVisibilityChange,
  reserveTopSpace = true,
  renderedAt,
}: ArticleViewProps = {}) {
  const article = useAppStore(
    (state) => state.articles.find((item) => item.id === state.selectedArticleId) ?? null,
  );
  const feed = useAppStore((state) => {
    const currentArticle = state.articles.find((item) => item.id === state.selectedArticleId);
    return currentArticle
      ? state.feeds.find((item) => item.id === currentArticle.feedId) ?? null
      : null;
  });
  const markAsRead = useAppStore((state) => state.markAsRead);
  const toggleStar = useAppStore((state) => state.toggleStar);
  const refreshArticle = useAppStore((state) => state.refreshArticle);
  const setSelectedView = useAppStore((state) => state.setSelectedView);
  const setSelectedArticle = useAppStore((state) => state.setSelectedArticle);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const general = useSettingsStore((state) => state.persistedSettings.general);
  const autoMarkReadEnabled = useSettingsStore(
    (state) => state.persistedSettings.general.autoMarkReadEnabled,
  );
  const autoMarkReadDelayMs = useSettingsStore(
    (state) => state.persistedSettings.general.autoMarkReadDelayMs,
  );
  const [tasks, setTasks] = useState<ArticleTasksDto | null>(null);
  const [aiSummaryExpandedArticleId, setAiSummaryExpandedArticleId] = useState<string | null>(
    null,
  );
  const lastReportedTitleVisibilityRef = useRef<boolean | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const articleContentRef = useRef<HTMLDivElement | null>(null);
  const imagePreviewSequenceRef = useRef(0);
  const scrollStateFrameRef = useRef<number | null>(null);
  const pendingScrollElementRef = useRef<HTMLDivElement | null>(null);
  const [scrollAssistArticleId, setScrollAssistArticleId] = useState<string | null>(null);
  const [scrollAssistPercent, setScrollAssistPercent] = useState(0);
  const [articleTitleVisible, setArticleTitleVisible] = useState(true);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [isDesktop, setIsDesktop] = useState<boolean>(true);
  const referenceTime = useRenderTimeSnapshot(renderedAt);

  const feedFullTextOnOpenEnabled = feed?.fullTextOnOpenEnabled ?? false;
  const feedAiSummaryOnOpenEnabled = feed?.aiSummaryOnOpenEnabled ?? false;
  const feedBodyTranslateOnOpenEnabled = feed?.bodyTranslateOnOpenEnabled ?? false;
  const currentArticleId = article?.id ?? null;
  const immersiveTranslation = useImmersiveTranslation({ articleId: currentArticleId });
  const streamingAiSummary = useStreamingAiSummary({
    articleId: currentArticleId,
    initialSession: article?.aiSummarySession ?? null,
    onCompleted: async (articleId) => {
      await refreshArticle(articleId);
    },
  });
  const requestStreamingAiSummary = streamingAiSummary.requestSummary;
  const fulltextStatus = tasks?.fulltext.status ?? 'idle';
  const fulltextPending = Boolean(
    currentArticleId && (fulltextStatus === 'queued' || fulltextStatus === 'running'),
  );
  const fulltextLoading = fulltextPending;
  const aiSummaryLoading = streamingAiSummary.loading;
  const aiSummaryMissingApiKey = streamingAiSummary.missingApiKey;
  const aiSummaryWaitingFulltext = streamingAiSummary.waitingFulltext;
  const aiSummaryExpanded = Boolean(
    currentArticleId && aiSummaryExpandedArticleId === currentArticleId,
  );
  const aiTranslationLoading = immersiveTranslation.loading;
  const aiTranslationMissingApiKey = immersiveTranslation.missingApiKey;
  const aiTranslationTimedOut = immersiveTranslation.timedOut;
  const aiTranslationWaitingFulltext = immersiveTranslation.waitingFulltext;
  const aiTranslationViewing = immersiveTranslation.viewing;
  const immersiveTranslationSession = immersiveTranslation.session;
  const requestImmersiveTranslation = immersiveTranslation.requestTranslation;
  const hasLegacyAiTranslationContent = Boolean(
    article?.aiTranslationBilingualHtml?.trim() || article?.aiTranslationZhHtml?.trim(),
  );
  const hasImmersiveSegments = immersiveTranslation.segments.length > 0;
  const hasAiTranslationContent = hasLegacyAiTranslationContent || hasImmersiveSegments;
  const bodyTranslationEligible = article?.bodyTranslationEligible !== false;
  // AI digest articles are already synthesized content, so fulltext/translation actions stay disabled.
  const isAiDigestArticle = (feed?.kind ?? 'rss') === 'ai_digest';
  const aiDigestSources = article?.aiDigestSources ?? [];
  const titleOriginal = article?.titleOriginal?.trim() || article?.title || '';
  const titleZh = article?.titleZh?.trim();
  const showBilingualTitle = aiTranslationViewing && Boolean(titleZh);
  const showDesktopToolbar = reserveTopSpace && isDesktop;
  const activeImagePreview =
    imagePreview?.articleId === currentArticleId ? imagePreview : null;
  const scrollStateMatchesCurrentArticle = scrollAssistArticleId === currentArticleId;
  const effectiveScrollAssistPercent = scrollStateMatchesCurrentArticle ? scrollAssistPercent : 0;
  const effectiveArticleTitleVisible = scrollStateMatchesCurrentArticle ? articleTitleVisible : true;
  const effectiveHasScrollableContent = scrollStateMatchesCurrentArticle ? hasScrollableContent : false;

  const reportTitleVisibility = useCallback(
    (isVisible: boolean) => {
      if (!onTitleVisibilityChange) return;
      if (lastReportedTitleVisibilityRef.current === isVisible) return;
      lastReportedTitleVisibilityRef.current = isVisible;
      onTitleVisibilityChange(isVisible);
    },
    [onTitleVisibilityChange],
  );

  const updateScrollAssistState = useCallback((element: HTMLDivElement) => {
    const maxScroll = Math.max(element.scrollHeight - element.clientHeight, 0);
    const nextProgress = maxScroll <= 0 ? 0 : Math.min(1, Math.max(0, element.scrollTop / maxScroll));
    const nextPercent = Math.round(nextProgress * 100);
    const nextTitleVisible = element.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX;
    const nextHasScrollableContent = maxScroll > 0;

    setScrollAssistArticleId((current) => (current === currentArticleId ? current : currentArticleId));
    setHasScrollableContent((current) =>
      current === nextHasScrollableContent ? current : nextHasScrollableContent,
    );
    setScrollAssistPercent((current) => (current === nextPercent ? current : nextPercent));
    setArticleTitleVisible((current) => (current === nextTitleVisible ? current : nextTitleVisible));
  }, [currentArticleId]);

  const cancelScheduledScrollStateUpdate = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const frameId = scrollStateFrameRef.current;
    if (frameId === null) {
      return;
    }

    window.cancelAnimationFrame(frameId);
    scrollStateFrameRef.current = null;
  }, []);

  const scheduleScrollStateUpdate = useCallback(
    (element: HTMLDivElement) => {
      pendingScrollElementRef.current = element;
      if (typeof window === 'undefined' || scrollStateFrameRef.current !== null) {
        return;
      }

      scrollStateFrameRef.current = window.requestAnimationFrame(() => {
        scrollStateFrameRef.current = null;
        const pendingElement = pendingScrollElementRef.current;
        if (!pendingElement) {
          return;
        }

        updateScrollAssistState(pendingElement);
      });
    },
    [updateScrollAssistState],
  );

  const onArticleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const element = event.currentTarget;
      reportTitleVisibility(element.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX);
      scheduleScrollStateUpdate(element);
    },
    [reportTitleVisibility, scheduleScrollStateUpdate],
  );

  useEffect(() => {
    return () => {
      cancelScheduledScrollStateUpdate();
    };
  }, [cancelScheduledScrollStateUpdate]);

  const handleBackToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateDesktopState = () => {
      const nextIsDesktop = window.innerWidth >= READER_RESIZE_DESKTOP_MIN_WIDTH;
      setIsDesktop((currentIsDesktop) =>
        currentIsDesktop === nextIsDesktop ? currentIsDesktop : nextIsDesktop,
      );
    };

    updateDesktopState();
    window.addEventListener('resize', updateDesktopState);

    return () => {
      window.removeEventListener('resize', updateDesktopState);
    };
  }, []);

  useEffect(() => {
    lastReportedTitleVisibilityRef.current = null;
    reportTitleVisibility(true);
  }, [article?.id, reportTitleVisibility]);

  useEffect(() => {
    if (!article || article.isRead) {
      return undefined;
    }

    if (!autoMarkReadEnabled) {
      return undefined;
    }

    if (autoMarkReadDelayMs === 0) {
      markAsRead(article.id);
      return undefined;
    }

    const timer = setTimeout(() => {
      markAsRead(article.id);
    }, autoMarkReadDelayMs);

    return () => clearTimeout(timer);
  }, [article, autoMarkReadDelayMs, autoMarkReadEnabled, markAsRead]);

  const requestFulltext = useCallback(
    async (articleId: string, input?: { signal?: AbortSignal; force?: boolean }) => {
      const signal = input?.signal;
      const force = Boolean(input?.force);

      await enqueueArticleFulltext(articleId, { force });
      const result = await pollWithBackoff({
        fn: () => getArticleTasks(articleId),
        stop: (value) => {
          const status = value.fulltext.status;
          return status === 'idle' || status === 'succeeded' || status === 'failed';
        },
        onValue: (value) => {
          if (!signal?.aborted) setTasks(value);
        },
        signal,
      });

      if (result.value?.fulltext.status === 'succeeded') {
        await refreshArticle(articleId);
      }
    },
    [refreshArticle],
  );

  useEffect(() => {
    const articleId = article?.id ?? null;
    const articleLink = article?.link ?? '';
    if (!articleId) return;

    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      setTasks(null);

      try {
        const initialTasks = await getArticleTasks(articleId);
        if (signal.aborted) return;
        setTasks(initialTasks);
      } catch (err) {
        console.error(err);
        if (signal.aborted) return;
      }

      if (!feedFullTextOnOpenEnabled) return;
      if (isAiDigestArticle) return;
      if (!articleLink) return;

      try {
        await requestFulltext(articleId, { signal, force: false });
        if (signal.aborted) return;
      } catch (err) {
        console.error(err);
        return;
      }
    })();

    return () => {
      controller.abort();
      setTasks(null);
    };
  }, [article?.id, article?.link, feedFullTextOnOpenEnabled, isAiDigestArticle, requestFulltext]);

  useEffect(() => {
    const articleId = article?.id ?? null;
    if (!articleId) return;
    if (!feedAiSummaryOnOpenEnabled) return;
    const hasFormalAiSummary = Boolean(article?.aiSummary?.trim());
    const hasActiveSession =
      article?.aiSummarySession?.status === 'queued' || article?.aiSummarySession?.status === 'running';
    if (!hasActiveSession && hasFormalAiSummary) return;

    queueMicrotask(() => {
      void requestStreamingAiSummary();
    });
  }, [
    article?.aiSummary,
    article?.aiSummarySession?.id,
    article?.aiSummarySession?.status,
    article?.id,
    feedAiSummaryOnOpenEnabled,
    requestStreamingAiSummary,
  ]);

  useEffect(() => {
    const articleId = article?.id ?? null;
    if (!articleId) return;
    if (!feedBodyTranslateOnOpenEnabled) return;
    if (isAiDigestArticle) return;
    if (!bodyTranslationEligible) return;
    if (hasAiTranslationContent || immersiveTranslationSession) return;

    void requestImmersiveTranslation({ force: false, autoView: true });
  }, [
    article?.id,
    bodyTranslationEligible,
    feedBodyTranslateOnOpenEnabled,
    isAiDigestArticle,
    hasAiTranslationContent,
    immersiveTranslationSession,
    requestImmersiveTranslation,
  ]);

  const fulltextButtonDisabled = fulltextPending || isAiDigestArticle;
  const aiTranslationButtonDisabled = isAiDigestArticle;
  const aiSummaryButtonDisabled = feedFullTextOnOpenEnabled && fulltextPending;
  const showDesktopStarButton = Boolean(article);
  const showDesktopFulltextButton = Boolean(article) && !fulltextButtonDisabled;
  const showDesktopTranslationButton =
    Boolean(article) && bodyTranslationEligible && !aiTranslationButtonDisabled;
  const showDesktopAiSummaryButton = Boolean(article) && !aiSummaryButtonDisabled;
  const activeAiSummarySession = streamingAiSummary.session;
  const showingStreamingSummary = Boolean(activeAiSummarySession);
  const sourceAiSummaryText = showingStreamingSummary
    ? (activeAiSummarySession?.finalText?.trim() ||
        activeAiSummarySession?.draftText?.trim() ||
        '')
    : (article?.aiSummary?.trim() ?? '');
  const { displayText: animatedAiSummaryText } = useAnimatedAiSummaryText({
    articleId: currentArticleId,
    sourceText: sourceAiSummaryText,
    status: activeAiSummarySession?.status ?? null,
  });

  function onFulltextButtonClick() {
    if (!article?.id) return;
    if (isAiDigestArticle) return;
    void requestFulltext(article.id, { force: true });
  }

  function onAiSummaryButtonClick() {
    if (!article?.id) return;
    void requestStreamingAiSummary({ force: true });
  }

  function onAiTranslationButtonClick() {
    if (!article?.id) return;
    if (isAiDigestArticle) return;
    void requestImmersiveTranslation({ force: true, autoView: true });
  }

  async function onAiDigestSourceClick(source: ArticleAiDigestSource) {
    setSelectedView(source.feedId);
    await loadSnapshot({ view: source.feedId });
    setSelectedArticle(source.articleId);
  }

  function renderDesktopToolbar() {
    const desktopToolbarTitle = article ? titleOriginal : '选择文章后可查看内容';
    const showToolbarTitle = Boolean(article && !effectiveArticleTitleVisible);

    return (
      <div
        data-testid="article-desktop-toolbar"
        className="flex h-12 min-w-0 items-center justify-between gap-3 px-4"
      >
        <div className="min-w-0 flex-1">
          {showToolbarTitle && article?.link ? (
            <a
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`打开原文：${desktopToolbarTitle}`}
              className="block truncate rounded-sm text-[0.96rem] font-semibold tracking-[0.01em] underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {desktopToolbarTitle}
            </a>
          ) : showToolbarTitle ? (
            <span className="block truncate text-[0.96rem] font-semibold tracking-[0.01em] text-foreground">
              {desktopToolbarTitle}
            </span>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {showDesktopStarButton ? (
            <ReaderToolbarIconButton
              // Keep desktop star icon fill behavior aligned with inline mobile actions.
              icon={({ className }) => (
                <Star
                  className={className}
                  fill={article?.isStarred ? 'currentColor' : 'none'}
                />
              )}
              label={article?.isStarred ? '已收藏' : '收藏'}
              pressed={Boolean(article?.isStarred)}
              onClick={article ? () => toggleStar(article.id) : undefined}
            />
          ) : null}
          {showDesktopFulltextButton ? (
            <ReaderToolbarIconButton
              icon={FileText}
              label="抓取全文"
              onClick={article ? onFulltextButtonClick : undefined}
            />
          ) : null}
          {showDesktopTranslationButton ? (
            <ReaderToolbarIconButton
              icon={Languages}
              label="翻译"
              onClick={article ? onAiTranslationButtonClick : undefined}
            />
          ) : null}
          {showDesktopAiSummaryButton ? (
            <ReaderToolbarIconButton
              icon={Sparkles}
              label="生成摘要"
              onClick={article ? onAiSummaryButtonClick : undefined}
            />
          ) : null}
          <ReaderToolbarIconButton
            icon={SettingsIcon}
            label="打开设置"
            onClick={onOpenSettings}
          />
        </div>
      </div>
    );
  }

  const toggleAiSummaryExpanded = useCallback(() => {
    if (!currentArticleId) return;
    setAiSummaryExpandedArticleId((current) =>
      current === currentArticleId ? null : currentArticleId,
    );
  }, [currentArticleId]);

  const openImagePreview = useCallback(
    (image: HTMLImageElement) => {
      const src = image.currentSrc || image.getAttribute('src') || image.src;
      if (!src) return;

      imagePreviewSequenceRef.current += 1;
      setImagePreview({
        articleId: currentArticleId,
        previewId: imagePreviewSequenceRef.current,
        src,
        alt: image.getAttribute('alt')?.trim() || '文章图片',
      });
    },
    [currentArticleId],
  );

  const getPreviewableArticleImage = useCallback((target: Element) => {
    const image = target.closest('img');
    if (!(image instanceof HTMLImageElement)) return null;
    if (image.closest('a[href]')) return null;

    return image;
  }, []);

  const onArticleContentClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;

      const retryTarget = eventTarget.closest('[data-action="retry-segment"]');
      if (retryTarget) {
        const rawSegmentIndex = retryTarget.getAttribute('data-segment-index');
        const segmentIndex = rawSegmentIndex ? Number(rawSegmentIndex) : Number.NaN;
        if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return;

        void immersiveTranslation.retrySegment(segmentIndex);
        return;
      }

      const image = getPreviewableArticleImage(eventTarget);
      if (!image) return;

      event.preventDefault();
      openImagePreview(image);
    },
    [getPreviewableArticleImage, immersiveTranslation, openImagePreview],
  );

  const onArticleContentKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const image = getPreviewableArticleImage(target);
      if (!image) return;

      event.preventDefault();
      openImagePreview(image);
    },
    [getPreviewableArticleImage, openImagePreview],
  );

  const immersiveHtml = useMemo(
    () => buildImmersiveHtml(article?.content ?? '', immersiveTranslation.segments),
    [article?.content, immersiveTranslation.segments],
  );
  const bodyHtml =
    aiTranslationViewing && hasImmersiveSegments
      ? immersiveHtml
      : aiTranslationViewing && hasLegacyAiTranslationContent
        ? (article?.aiTranslationBilingualHtml?.trim() ||
            article?.aiTranslationZhHtml?.trim() ||
            article?.content ||
            '')
        : article?.content || '';
  const articleBodyMarkup = useMemo(() => ({ __html: bodyHtml }), [bodyHtml]);

  useEffect(() => {
    const container = articleContentRef.current;
    if (!container) return;

    for (const node of container.querySelectorAll('img')) {
      if (!(node instanceof HTMLImageElement)) continue;
      if (node.closest('a[href]')) continue;

      const alt = node.alt?.trim();
      const label = alt ? `查看大图：${alt}` : '查看大图';
      node.tabIndex = 0;
      node.setAttribute('role', 'button');
      node.setAttribute('aria-label', label);
      node.classList.add('cursor-zoom-in');
    }
  }, [bodyHtml]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const element = scrollContainerRef.current;
    if (!element) {
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      reportTitleVisibility(element.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX);
      updateScrollAssistState(element);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [article?.id, bodyHtml, isDesktop, reportTitleVisibility, updateScrollAssistState]);

  if (!article) {
    return (
      <div className="flex h-full flex-col bg-background text-foreground">
        {showDesktopToolbar ? renderDesktopToolbar() : reserveTopSpace ? <div className="h-12 shrink-0" /> : null}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">从列表中选择一篇文章开始阅读</p>
        </div>
      </div>
    );
  }

  const fontSizeClass = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  }[general.fontSize];

  const lineHeightClass = {
    compact: 'leading-normal',
    normal: 'leading-relaxed',
    relaxed: 'leading-loose',
  }[general.lineHeight];

  const fontFamilyClass = general.fontFamily === 'serif' ? 'font-serif' : 'font-sans';
  const aiSummaryFontSizeClass = {
    small: 'text-sm',
    medium: 'text-sm',
    large: 'text-base',
  }[general.fontSize];
  const aiSummaryLineHeightClass = {
    compact: 'leading-relaxed',
    normal: 'leading-relaxed',
    relaxed: 'leading-relaxed',
  }[general.lineHeight];
  const aiSummaryText = showingStreamingSummary ? animatedAiSummaryText : sourceAiSummaryText;
  const aiSummaryLines = aiSummaryText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const aiSummaryTldrText = aiSummaryLines.slice(0, 2).join(' ');
  const aiSummaryContentId = `ai-summary-${article.id}`;
  const aiSummaryErrorMessage =
    activeAiSummarySession?.errorMessage ||
    tasks?.ai_summary.errorMessage ||
    '暂时无法生成摘要';
  const aiSummarySessionFailed = activeAiSummarySession?.status === 'failed';
  const aiSummarySessionRunning =
    activeAiSummarySession?.status === 'queued' || activeAiSummarySession?.status === 'running';
  const showScrollAssist = isDesktop && !effectiveArticleTitleVisible && effectiveHasScrollableContent;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {showDesktopToolbar ? renderDesktopToolbar() : reserveTopSpace ? <div className="h-12 shrink-0" /> : null}
      <div className="relative flex-1 overflow-hidden" data-testid="article-viewport">
        <div
          ref={scrollContainerRef}
          className="h-full overflow-y-auto"
          onScroll={onArticleScroll}
          data-testid="article-scroll-container"
        >
          <div
            className="w-full px-8 pb-12 pt-4 lg:pl-12 lg:pr-8"
            data-testid="article-content-shell"
          >
          <div className="mb-8">
            <h1 className="mb-4 break-words text-3xl font-bold tracking-tight">
              {article.link ? (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'group max-w-full break-words rounded-sm underline-offset-4 transition-colors hover:text-foreground/90 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    showBilingualTitle ? 'inline-flex flex-col items-start gap-1' : 'inline-flex items-center gap-2',
                  )}
                >
                  <span className="break-words">{titleOriginal}</span>
                  {showBilingualTitle ? (
                    <span className="break-words text-base font-medium text-muted-foreground">{titleZh}</span>
                  ) : null}
                </a>
              ) : (
                <span
                  className={cn(
                    'max-w-full break-words',
                    showBilingualTitle ? 'inline-flex flex-col items-start gap-1' : undefined,
                  )}
                >
                  <span className="break-words">{titleOriginal}</span>
                  {showBilingualTitle ? (
                    <span className="break-words text-base font-medium text-muted-foreground">{titleZh}</span>
                  ) : null}
                </span>
              )}
            </h1>

            <div className="mb-4 flex items-center text-sm text-muted-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                  <span aria-hidden="true" className="text-[11px] leading-none">
                    📰
                  </span>
                  {feed?.icon ? (
                    <img
                      src={feed.icon}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      width={16}
                      height={16}
                      data-testid="article-feed-icon"
                      className="absolute inset-0 h-full w-full rounded-[3px] bg-background object-cover"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                </span>
                <span className="min-w-0 break-words">{feed?.title}</span>
                <span aria-hidden="true" className="shrink-0">
                  ·
                </span>
                <span className="shrink-0">{formatRelativeTime(article.publishedAt, referenceTime)}</span>
                {article.author && (
                  <>
                    <span aria-hidden="true" className="shrink-0">
                      ·
                    </span>
                    <span className="min-w-0 break-words">{article.author}</span>
                  </>
                )}
              </div>
            </div>

            {!showDesktopToolbar ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={() => toggleStar(article.id)}
                  variant={article.isStarred ? 'default' : 'secondary'}
                  size="compact"
                  className="cursor-pointer"
                >
                  <Star fill={article.isStarred ? 'currentColor' : 'none'} />
                  <span>{article.isStarred ? '已收藏' : '收藏'}</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="cursor-pointer"
                  onClick={onFulltextButtonClick}
                  disabled={fulltextButtonDisabled}
                >
                  <FileText />
                  <span>抓取全文</span>
                </Button>

                {bodyTranslationEligible ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="cursor-pointer"
                    onClick={onAiTranslationButtonClick}
                    disabled={aiTranslationButtonDisabled}
                  >
                    <Languages />
                    <span>翻译</span>
                  </Button>
                ) : null}

                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="cursor-pointer"
                  onClick={onAiSummaryButtonClick}
                  disabled={aiSummaryButtonDisabled}
                >
                  <Sparkles />
                  <span>生成摘要</span>
                </Button>
              </div>
            ) : null}
          </div>

          {fulltextLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在抓取全文，完成后会自动更新</span>
              </div>
            </div>
          ) : null}

          {aiSummaryText ? (
            <section
              className="relative mb-4 cursor-pointer rounded-xl border border-border/65 border-l-2 border-l-primary/30 bg-primary/10 px-4 py-3"
              aria-label="AI 摘要"
              onClick={toggleAiSummaryExpanded}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground ring-1 ring-border/60">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>AI 摘要</span>
                  </span>
                  {aiSummarySessionRunning ? (
                    <span className="text-[11px] text-muted-foreground">正在生成摘要</span>
                  ) : null}
                  <span className="text-[11px] text-muted-foreground">
                    摘要可能有误，请以原文为准
                  </span>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-7 shrink-0 px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  aria-expanded={aiSummaryExpanded}
                  aria-controls={aiSummaryContentId}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleAiSummaryExpanded();
                  }}
                >
                  {aiSummaryExpanded ? '收起摘要' : '展开摘要'}
                </Button>
              </div>

              <div id={aiSummaryContentId} className="mt-2 border-t border-border/40 pt-2">
                {aiSummaryExpanded ? (
                  <div
                    className={cn(
                      'space-y-2 text-foreground/85',
                      aiSummaryFontSizeClass,
                      aiSummaryLineHeightClass,
                      fontFamilyClass,
                    )}
                  >
                    {aiSummaryLines.map((line, index) => (
                      <p key={`${article.id}-ai-summary-${index}`}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <p
                    className={cn(
                      'line-clamp-2 text-foreground/85',
                      aiSummaryFontSizeClass,
                      aiSummaryLineHeightClass,
                      fontFamilyClass,
                    )}
                  >
                    {aiSummaryTldrText || aiSummaryText}
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {!aiSummaryText && aiSummaryLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在生成摘要，请稍候…</span>
              </div>
            </div>
          ) : null}

          {!aiSummaryText && aiSummaryMissingApiKey ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              请先在设置中配置 AI API 密钥，才能生成摘要
            </div>
          ) : null}

          {!aiSummaryText && aiSummaryWaitingFulltext ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              请先等待全文抓取完成，再开始摘要
            </div>
          ) : null}

          {aiSummaryText && aiSummarySessionFailed ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
                <span className="min-w-0 flex-1 break-words">{aiSummaryErrorMessage}</span>
                <Button type="button" variant="secondary" size="sm" onClick={onAiSummaryButtonClick}>
                  重试
                </Button>
              </div>
            </div>
          ) : null}

          {!aiSummaryText &&
          !aiSummaryLoading &&
          !aiSummaryMissingApiKey &&
          !aiSummaryWaitingFulltext &&
          (aiSummarySessionFailed || tasks?.ai_summary.status === 'failed') ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
                <span className="min-w-0 flex-1 break-words">{aiSummaryErrorMessage}</span>
                <Button type="button" variant="secondary" size="sm" onClick={onAiSummaryButtonClick}>
                  重试
                </Button>
              </div>
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在翻译文章，请稍候…</span>
              </div>
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationMissingApiKey ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              请先在设置中配置 AI API 密钥，才能翻译文章
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationTimedOut ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              翻译还在处理中。请稍后重试，或刷新查看结果。
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationWaitingFulltext ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              请先等待全文抓取完成，再开始翻译
            </div>
          ) : null}

          {!hasAiTranslationContent &&
          !aiTranslationLoading &&
          !aiTranslationMissingApiKey &&
          !aiTranslationTimedOut &&
          !aiTranslationWaitingFulltext &&
          tasks?.ai_translate.status === 'failed' ? (
            <div className="mb-4 rounded-xl border border-border/70 bg-muted/35 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-start justify-between gap-2 sm:items-center">
                <span className="min-w-0 flex-1 break-words">
                  {tasks.ai_translate.errorMessage || '暂时无法完成翻译'}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={onAiTranslationButtonClick}
                >
                  重试
                </Button>
              </div>
            </div>
          ) : null}

          {isAiDigestArticle ? (
            <section
              className="mb-6 rounded-xl border border-border/65 bg-muted/20 px-4 py-3"
              aria-label="来源"
            >
              <h2 className="text-sm font-semibold">来源</h2>
              {aiDigestSources.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">暂无来源记录</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {aiDigestSources.map((source) => (
                    <li key={`${article.id}-${source.articleId}-${source.position}`}>
                      <button
                        type="button"
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-2 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        onClick={() => {
                          void onAiDigestSourceClick(source);
                        }}
                      >
                        <span className="min-w-0 space-y-0.5">
                          <span className="block break-words text-sm font-medium text-foreground">
                            {source.title}
                          </span>
                          <span className="block break-words text-xs text-muted-foreground">
                            {source.feedTitle}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelativeTime(source.publishedAt ?? article.publishedAt, referenceTime)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <div
            ref={articleContentRef}
            className={cn(
              'prose max-w-none dark:prose-invert',
              fontSizeClass,
              lineHeightClass,
              fontFamilyClass,
            )}
            data-testid="article-html-content"
            onClickCapture={onArticleContentClick}
            onKeyDownCapture={onArticleContentKeyDown}
            dangerouslySetInnerHTML={articleBodyMarkup}
          />
        </div>
        </div>

        <ArticleScrollAssist
          visible={showScrollAssist}
          percent={effectiveScrollAssistPercent}
          onBackToTop={handleBackToTop}
        />
        <ArticleImagePreview
          key={activeImagePreview?.previewId ?? 'empty'}
          image={activeImagePreview}
          open={Boolean(activeImagePreview)}
          onOpenChange={(open) => {
            if (!open) setImagePreview(null);
          }}
        />
      </div>
    </div>
  );
}
