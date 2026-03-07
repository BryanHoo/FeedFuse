import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type UIEvent } from 'react';
import { Languages, Sparkles, Star } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  enqueueArticleAiSummary,
  enqueueArticleFulltext,
  getArticleTasks,
  type ArticleTasksDto,
} from '../../lib/apiClient';
import { pollWithBackoff } from '../../lib/polling';
import { formatRelativeTime } from '../../utils/date';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useImmersiveTranslation } from './useImmersiveTranslation';
import { buildImmersiveHtml } from './immersiveRender';

const FLOATING_TITLE_SCROLL_THRESHOLD_PX = 96;

interface ArticleViewProps {
  onTitleVisibilityChange?: (isVisible: boolean) => void;
}

export default function ArticleView({ onTitleVisibilityChange }: ArticleViewProps = {}) {
  const { articles, feeds, selectedArticleId, markAsRead, toggleStar, refreshArticle } =
    useAppStore();
  const general = useSettingsStore((state) => state.persistedSettings.general);
  const autoMarkReadEnabled = useSettingsStore(
    (state) => state.persistedSettings.general.autoMarkReadEnabled,
  );
  const autoMarkReadDelayMs = useSettingsStore(
    (state) => state.persistedSettings.general.autoMarkReadDelayMs,
  );
  const [tasks, setTasks] = useState<ArticleTasksDto | null>(null);
  const [aiSummaryLoadingArticleId, setAiSummaryLoadingArticleId] = useState<string | null>(null);
  const [aiSummaryMissingApiKeyArticleId, setAiSummaryMissingApiKeyArticleId] = useState<
    string | null
  >(null);
  const [aiSummaryTimedOutArticleId, setAiSummaryTimedOutArticleId] = useState<string | null>(
    null,
  );
  const [aiSummaryExpandedArticleId, setAiSummaryExpandedArticleId] = useState<string | null>(
    null,
  );
  const lastReportedTitleVisibilityRef = useRef<boolean | null>(null);

  const article = articles.find((item) => item.id === selectedArticleId);
  const feed = article ? feeds.find((item) => item.id === article.feedId) : null;
  const feedFullTextOnOpenEnabled = feed?.fullTextOnOpenEnabled ?? false;
  const feedAiSummaryOnOpenEnabled = feed?.aiSummaryOnOpenEnabled ?? false;
  const feedBodyTranslateOnOpenEnabled = feed?.bodyTranslateOnOpenEnabled ?? false;
  const currentArticleId = article?.id ?? null;
  const immersiveTranslation = useImmersiveTranslation({ articleId: currentArticleId });
  const fulltextStatus = tasks?.fulltext.status ?? 'idle';
  const fulltextPending = Boolean(
    currentArticleId && (fulltextStatus === 'queued' || fulltextStatus === 'running'),
  );
  const fulltextLoading = fulltextPending;
  const aiSummaryLoading = Boolean(
    currentArticleId && aiSummaryLoadingArticleId === currentArticleId,
  );
  const aiSummaryMissingApiKey = Boolean(
    currentArticleId && aiSummaryMissingApiKeyArticleId === currentArticleId,
  );
  const aiSummaryTimedOut = Boolean(
    currentArticleId && aiSummaryTimedOutArticleId === currentArticleId,
  );
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

  const reportTitleVisibility = useCallback(
    (isVisible: boolean) => {
      if (!onTitleVisibilityChange) return;
      if (lastReportedTitleVisibilityRef.current === isVisible) return;
      lastReportedTitleVisibilityRef.current = isVisible;
      onTitleVisibilityChange(isVisible);
    },
    [onTitleVisibilityChange],
  );

  const onArticleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      reportTitleVisibility(event.currentTarget.scrollTop <= FLOATING_TITLE_SCROLL_THRESHOLD_PX);
    },
    [reportTitleVisibility],
  );

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
      if (!articleLink) return;

      try {
        await enqueueArticleFulltext(articleId);
        if (signal.aborted) return;
      } catch (err) {
        console.error(err);
        return;
      }

      const result = await pollWithBackoff({
        fn: () => getArticleTasks(articleId),
        stop: (value) => {
          const status = value.fulltext.status;
          return status === 'idle' || status === 'succeeded' || status === 'failed';
        },
        onValue: (value) => {
          if (!signal.aborted) setTasks(value);
        },
        signal,
      });

      if (signal.aborted) return;

      if (result.value?.fulltext.status === 'succeeded') {
        const refreshed = await refreshArticle(articleId);
        if (signal.aborted) return;
        if (refreshed.hasFulltext || refreshed.hasFulltextError) {
          return;
        }
      }
    })();

    return () => {
      controller.abort();
      setTasks(null);
    };
  }, [article?.id, article?.link, feedFullTextOnOpenEnabled, refreshArticle]);

  const requestAiSummary = useCallback(
    async (
      articleId: string,
      input?: {
        signal?: AbortSignal;
        force?: boolean;
      },
    ) => {
      const signal = input?.signal;
      const isCancelled = () => Boolean(signal?.aborted);
      const force = Boolean(input?.force);

      try {
        const enqueueResult = force
          ? await enqueueArticleAiSummary(articleId, { force: true })
          : await enqueueArticleAiSummary(articleId);
        if (isCancelled()) return;
        setAiSummaryMissingApiKeyArticleId((current) => (current === articleId ? null : current));
        setAiSummaryTimedOutArticleId((current) => (current === articleId ? null : current));

        if (enqueueResult.reason === 'missing_api_key') {
          setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));
          setAiSummaryMissingApiKeyArticleId(articleId);
          return;
        }

        if (!force && enqueueResult.reason === 'already_summarized') {
          const refreshed = await refreshArticle(articleId);
          if (isCancelled()) return;
          if (refreshed.hasAiSummary) {
            setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));
            return;
          }
        }

        if (
          enqueueResult.enqueued ||
          enqueueResult.reason === 'already_enqueued' ||
          (!force && enqueueResult.reason === 'already_summarized')
        ) {
          setAiSummaryLoadingArticleId(articleId);

          const polled = await pollWithBackoff({
            fn: () => getArticleTasks(articleId),
            stop: (value) => {
              const status = value.ai_summary.status;
              return status === 'succeeded' || status === 'failed';
            },
            onValue: (value) => {
              if (!isCancelled()) setTasks(value);
            },
            signal,
          });

          if (isCancelled()) return;

          setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));

          if (polled.timedOut) {
            setAiSummaryTimedOutArticleId(articleId);
            return;
          }

          const status = polled.value?.ai_summary.status ?? 'idle';
          if (status === 'succeeded') {
            const refreshed = await refreshArticle(articleId);
            if (isCancelled()) return;
            if (refreshed.hasAiSummary) return;
          }

          return;
        }

        setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));
      } catch (err) {
        console.error(err);
        if (!isCancelled()) {
          setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));
        }
      }
    },
    [refreshArticle],
  );

  useEffect(() => {
    const articleId = article?.id ?? null;
    if (!articleId) return;
    if (!feedAiSummaryOnOpenEnabled) return;
    if (article?.aiSummary) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      void requestAiSummary(articleId, { signal: controller.signal });
    });

    return () => {
      controller.abort();
      setAiSummaryLoadingArticleId((current) => (current === articleId ? null : current));
    };
  }, [article?.aiSummary, article?.id, feedAiSummaryOnOpenEnabled, requestAiSummary]);

  useEffect(() => {
    const articleId = article?.id ?? null;
    if (!articleId) return;
    if (!feedBodyTranslateOnOpenEnabled) return;
    if (!bodyTranslationEligible) return;
    if (hasAiTranslationContent || immersiveTranslationSession) return;

    void requestImmersiveTranslation({ force: false, autoView: true });
  }, [
    article?.id,
    bodyTranslationEligible,
    feedBodyTranslateOnOpenEnabled,
    hasAiTranslationContent,
    immersiveTranslationSession,
    requestImmersiveTranslation,
  ]);

  const aiSummaryButtonDisabled = feedFullTextOnOpenEnabled && fulltextPending;

  function onAiSummaryButtonClick() {
    if (!article?.id) return;
    void requestAiSummary(article.id, { force: true });
  }

  function onAiTranslationButtonClick() {
    if (!article?.id) return;
    void requestImmersiveTranslation({ force: true, autoView: true });
  }

  const toggleAiSummaryExpanded = useCallback(() => {
    if (!currentArticleId) return;
    setAiSummaryExpandedArticleId((current) =>
      current === currentArticleId ? null : currentArticleId,
    );
  }, [currentArticleId]);

  const onArticleContentClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const eventTarget = event.target;
      if (!(eventTarget instanceof Element)) return;

      const target = eventTarget.closest('[data-action="retry-segment"]');
      if (!target) return;

      const rawSegmentIndex = target.getAttribute('data-segment-index');
      const segmentIndex = rawSegmentIndex ? Number(rawSegmentIndex) : Number.NaN;
      if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return;

      void immersiveTranslation.retrySegment(segmentIndex);
    },
    [immersiveTranslation],
  );

  const immersiveHtml = useMemo(
    () => buildImmersiveHtml(article?.content ?? '', immersiveTranslation.segments),
    [article?.content, immersiveTranslation.segments],
  );

  if (!article) {
    return (
      <div className="flex h-full flex-col bg-background text-foreground">
        <div className="h-12 shrink-0" />
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">选择一篇文章开始阅读</p>
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
  const aiSummaryText = article.aiSummary?.trim() ?? '';
  const aiSummaryLines = aiSummaryText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const aiSummaryTldrText = aiSummaryLines.slice(0, 2).join(' ');
  const aiSummaryContentId = `ai-summary-${article.id}`;
  const bodyHtml =
    aiTranslationViewing && hasImmersiveSegments
      ? immersiveHtml
      : aiTranslationViewing && hasLegacyAiTranslationContent
        ? (article.aiTranslationBilingualHtml?.trim() || article.aiTranslationZhHtml?.trim() || article.content)
        : article.content;
  const titleOriginal = article.titleOriginal?.trim() || article.title;
  const titleZh = article.titleZh?.trim();
  const showBilingualTitle = aiTranslationViewing && Boolean(titleZh);

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <div className="h-12 shrink-0" />
      <div
        className="flex-1 overflow-y-auto"
        onScroll={onArticleScroll}
        data-testid="article-scroll-container"
      >
        <div className="mx-auto max-w-3xl px-8 pb-12 pt-4">
          <div className="mb-8">
            <h1 className="mb-4 text-3xl font-bold tracking-tight">
              {article.link ? (
                <a
                  href={article.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'group rounded-sm underline-offset-4 transition-colors hover:text-foreground/90 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    showBilingualTitle ? 'inline-flex flex-col items-start gap-1' : 'inline-flex items-center gap-2',
                  )}
                >
                  <span>{titleOriginal}</span>
                  {showBilingualTitle ? (
                    <span className="text-base font-medium text-muted-foreground">{titleZh}</span>
                  ) : null}
                </a>
              ) : (
                <span className={showBilingualTitle ? 'inline-flex flex-col items-start gap-1' : undefined}>
                  <span>{titleOriginal}</span>
                  {showBilingualTitle ? (
                    <span className="text-base font-medium text-muted-foreground">{titleZh}</span>
                  ) : null}
                </span>
              )}
            </h1>

            <div className="mb-4 flex items-center text-sm text-muted-foreground">
              <div className="flex min-w-0 items-center gap-2">
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
                <span>{feed?.title}</span>
                <span>·</span>
                <span>{formatRelativeTime(article.publishedAt)}</span>
                {article.author && (
                  <>
                    <span>·</span>
                    <span>{article.author}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => toggleStar(article.id)}
                variant={article.isStarred ? 'default' : 'secondary'}
                className="h-8 px-3 text-sm cursor-pointer transition-shadow hover:shadow-md"
              >
                <Star fill={article.isStarred ? 'currentColor' : 'none'} />
                <span>{article.isStarred ? '已收藏' : '收藏'}</span>
              </Button>

              {bodyTranslationEligible ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="h-8 px-3 text-sm cursor-pointer transition-shadow hover:shadow-md"
                  onClick={onAiTranslationButtonClick}
                >
                  <Languages />
                  <span>翻译</span>
                </Button>
              ) : null}

              <Button
                type="button"
                variant="secondary"
                className="h-8 px-3 text-sm cursor-pointer transition-shadow hover:shadow-md"
                onClick={onAiSummaryButtonClick}
                disabled={aiSummaryButtonDisabled}
              >
                <Sparkles />
                <span>AI摘要</span>
              </Button>
            </div>
          </div>

          {fulltextLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在抓取全文，稍后会自动更新</span>
              </div>
            </div>
          ) : null}

          {article.aiSummary ? (
            <section
              className="relative mb-4 cursor-pointer rounded-xl border border-border/60 border-l-2 border-l-primary/30 bg-primary/5 px-4 py-3"
              aria-label="AI 摘要"
              onClick={toggleAiSummaryExpanded}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background/60 px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted-foreground ring-1 ring-border/60">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>AI 摘要</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    可能包含误差，请以原文为准
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

          {!article.aiSummary && aiSummaryLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在生成摘要…</span>
              </div>
            </div>
          ) : null}

          {!article.aiSummary && aiSummaryMissingApiKey ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              请先在设置中配置 AI API Key
            </div>
          ) : null}

          {!article.aiSummary && aiSummaryTimedOut ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              仍在处理中，可稍后重试/刷新
            </div>
          ) : null}

          {!article.aiSummary &&
          !aiSummaryLoading &&
          !aiSummaryMissingApiKey &&
          !aiSummaryTimedOut &&
          tasks?.ai_summary.status === 'failed' ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{tasks.ai_summary.errorMessage || '摘要生成失败'}</span>
                <Button type="button" variant="secondary" size="sm" onClick={onAiSummaryButtonClick}>
                  重试
                </Button>
              </div>
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationLoading ? (
            <div
              className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70"
                  aria-hidden="true"
                />
                <span>正在翻译…</span>
              </div>
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationMissingApiKey ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              请先在设置中配置 AI API Key
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationTimedOut ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              仍在处理中，可稍后重试/刷新
            </div>
          ) : null}

          {!hasAiTranslationContent && aiTranslationWaitingFulltext ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              请先等待全文抓取完成，再尝试翻译
            </div>
          ) : null}

          {!hasAiTranslationContent &&
          !aiTranslationLoading &&
          !aiTranslationMissingApiKey &&
          !aiTranslationTimedOut &&
          !aiTranslationWaitingFulltext &&
          tasks?.ai_translate.status === 'failed' ? (
            <div className="mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{tasks.ai_translate.errorMessage || '翻译失败'}</span>
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

          <div
            className={cn(
              'prose max-w-none dark:prose-invert',
              fontSizeClass,
              lineHeightClass,
              fontFamilyClass,
            )}
            data-testid="article-html-content"
            onClick={onArticleContentClick}
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </div>
      </div>
    </div>
  );
}
