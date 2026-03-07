import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiClientModule = typeof import('../../lib/apiClient');

class FakeEventSource {
  private listeners = new Map<string, Set<(event: Event) => void>>();

  close = vi.fn();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn =
      typeof listener === 'function'
        ? (listener as (event: Event) => void)
        : (event: Event) => listener.handleEvent(event);
    const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn =
      typeof listener === 'function'
        ? (listener as (event: Event) => void)
        : (event: Event) => listener.handleEvent(event);
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit(eventType: string, payload: Record<string, unknown>) {
    const event = new MessageEvent(eventType, {
      data: JSON.stringify(payload),
      lastEventId: '1',
    });
    for (const listener of this.listeners.get(eventType) ?? []) {
      listener(event);
    }
  }
}

const idleTasks = {
  fulltext: {
    type: 'fulltext' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
  ai_summary: {
    type: 'ai_summary' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
  ai_translate: {
    type: 'ai_translate' as const,
    status: 'idle' as const,
    jobId: null,
    requestedAt: null,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    errorCode: null,
    errorMessage: null,
  },
};

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('../../lib/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    enqueueArticleAiTranslate: vi.fn(),
    getArticleAiTranslateSnapshot: vi.fn(),
    createArticleAiTranslateEventSource: vi.fn(),
    retryArticleAiTranslateSegment: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function seedArticleViewState(input?: {
  bodyTranslateEnabled?: boolean;
  bodyTranslateOnOpenEnabled?: boolean;
  fullTextOnOpenEnabled?: boolean;
  content?: string;
  feed?: Record<string, unknown>;
  article?: Record<string, unknown>;
}) {
  const bodyTranslateEnabled = input?.bodyTranslateEnabled ?? true;
  const bodyTranslateOnOpenEnabled = input?.bodyTranslateOnOpenEnabled ?? false;
  const fullTextOnOpenEnabled = input?.fullTextOnOpenEnabled ?? false;
  const content = input?.content ?? '<p>A</p><p>B</p>';

  return import('../../store/appStore').then(({ useAppStore }) => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled,
          bodyTranslateOnOpenEnabled,
          categoryId: null,
          category: null,
          articleListDisplayMode: 'card',
          ...input?.feed,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content,
          summary: 'summary',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
          ...input?.article,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      refreshArticle: vi.fn().mockResolvedValue({
        hasFulltext: false,
        hasFulltextError: false,
        hasAiSummary: false,
        hasAiTranslation: false,
      }),
    });
  });
}

describe('ArticleView ai translate', () => {
  let fakeEventSource: FakeEventSource;

  beforeEach(async () => {
    fakeEventSource = new FakeEventSource();

    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockReset();
    vi.mocked(apiClient.getArticleAiTranslateSnapshot).mockReset();
    vi.mocked(apiClient.createArticleAiTranslateEventSource).mockReset();
    vi.mocked(apiClient.retryArticleAiTranslateSegment).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();

    vi.mocked(apiClient.enqueueArticleFulltext).mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-1',
    });
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockResolvedValue({
      enqueued: true,
      jobId: 'job-1',
      sessionId: 'session-1',
    });
    vi.mocked(apiClient.getArticleAiTranslateSnapshot).mockResolvedValue({
      session: {
        id: 'session-1',
        articleId: 'article-1',
        sourceHtmlHash: 'hash-1',
        status: 'running',
        totalSegments: 2,
        translatedSegments: 0,
        failedSegments: 0,
        startedAt: '2026-03-04T00:00:00.000Z',
        finishedAt: null,
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
      segments: [
        {
          id: 'seg-0',
          segmentIndex: 0,
          sourceText: 'A',
          translatedText: null,
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          updatedAt: '2026-03-04T00:00:00.000Z',
        },
        {
          id: 'seg-1',
          segmentIndex: 1,
          sourceText: 'B',
          translatedText: null,
          status: 'pending',
          errorCode: null,
          errorMessage: null,
          updatedAt: '2026-03-04T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(apiClient.createArticleAiTranslateEventSource).mockImplementation(
      () => fakeEventSource as unknown as EventSource,
    );
    vi.mocked(apiClient.retryArticleAiTranslateSegment).mockResolvedValue({
      enqueued: true,
      jobId: 'job-retry-1',
    });
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

    await seedArticleViewState();
  });

  it('shows original first and appends translated paragraph below when SSE segment arrives', async () => {
    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    await act(async () => {
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 0,
        status: 'succeeded',
        translatedText: '甲',
      });
    });

    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('甲')).toBeInTheDocument();
  });

  it('keeps image in translation mode at original position', async () => {
    await seedArticleViewState({
      content: '<article><p>A</p><img src="https://img.example/a.jpg" alt="cover" /><p>B</p></article>',
    });
    const { default: ArticleView } = await import('./ArticleView');
    const { container } = render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    await act(async () => {
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 0,
        status: 'succeeded',
        translatedText: '甲',
      });
    });

    const html = container.querySelector('[data-testid="article-html-content"]')?.innerHTML ?? '';
    expect(html).toContain('img src="https://img.example/a.jpg"');
    expect(html).toMatch(/A<\/p>\s*<p class="ff-translation">甲<\/p>/);
  });

  it('keeps stable segment order when SSE events arrive out of order', async () => {
    const { default: ArticleView } = await import('./ArticleView');
    const { container } = render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));

    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
      expect(screen.getByText('B')).toBeInTheDocument();
    });

    await act(async () => {
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 1,
        status: 'succeeded',
        translatedText: '乙',
      });
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 0,
        status: 'succeeded',
        translatedText: '甲',
      });
    });

    const html = container.querySelector('[data-testid="article-html-content"]')?.innerHTML ?? '';
    expect(html).toMatch(
      /<p>A<\/p>\s*<p class="ff-translation">甲<\/p>\s*<p>B<\/p>\s*<p class="ff-translation">乙<\/p>/,
    );
  });

  it('翻译按钮文案固定为翻译，点击两次触发两次翻译请求', async () => {
    const apiClient = await import('../../lib/apiClient');
    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    const translateButton = screen.getByRole('button', { name: '翻译' });
    expect(screen.queryByRole('button', { name: '原文' })).not.toBeInTheDocument();

    fireEvent.click(translateButton);
    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).toHaveBeenNthCalledWith(1, 'article-1', {
        force: true,
      });
    });

    fireEvent.click(translateButton);
    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).toHaveBeenNthCalledWith(2, 'article-1', {
        force: true,
      });
    });
  });

  it('bodyTranslateEnabled=false 时翻译按钮仍可点击并触发请求', async () => {
    const apiClient = await import('../../lib/apiClient');
    await seedArticleViewState({ bodyTranslateEnabled: false });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    const translateButton = screen.getByRole('button', { name: '翻译' });
    expect(translateButton).not.toBeDisabled();

    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).toHaveBeenCalledWith('article-1', {
        force: true,
      });
    });
  });

  it('does not render translate button when bodyTranslationEligible is false', async () => {
    const apiClient = await import('../../lib/apiClient');
    await seedArticleViewState({
      article: {
        bodyTranslationEligible: false,
        bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      },
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    await waitFor(() => {
      expect(apiClient.getArticleTasks).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button', { name: '翻译' })).not.toBeInTheDocument();
  });

  it('does not auto-request translation on open when bodyTranslationEligible is false', async () => {
    const apiClient = await import('../../lib/apiClient');
    await seedArticleViewState({
      feed: { bodyTranslateOnOpenEnabled: true },
      article: {
        bodyTranslationEligible: false,
        bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      },
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).not.toHaveBeenCalled();
    });
  });

  it('全文抓取进行中时翻译按钮仍可点击并展示等待提示', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue({
      ...idleTasks,
      fulltext: {
        ...idleTasks.fulltext,
        status: 'running',
      },
    });
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockResolvedValue({
      enqueued: false,
      reason: 'fulltext_pending',
    });
    await seedArticleViewState({ fullTextOnOpenEnabled: true });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    await screen.findByText('正在抓取全文，稍后会自动更新');

    const translateButton = screen.getByRole('button', { name: '翻译' });
    expect(translateButton).not.toBeDisabled();

    fireEvent.click(translateButton);

    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).toHaveBeenCalledWith('article-1', {
        force: true,
      });
    });

    expect(screen.getByText('请先等待全文抓取完成，再尝试翻译')).toBeInTheDocument();
  });

  it('triggers retry API from delegated retry button inside rendered html', async () => {
    const apiClient = await import('../../lib/apiClient');
    const { default: ArticleView } = await import('./ArticleView');
    const { container } = render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    await waitFor(() => {
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    await act(async () => {
      fakeEventSource.emit('segment.failed', {
        segmentIndex: 0,
        status: 'failed',
        errorCode: 'ai_timeout',
        errorMessage: '请求超时',
      });
    });

    const retry = container.querySelector(
      '[data-action="retry-segment"][data-segment-index="0"]',
    ) as HTMLElement;
    fireEvent.click(retry);

    await waitFor(() => {
      expect(apiClient.retryArticleAiTranslateSegment).toHaveBeenCalledWith('article-1', 0);
    });
  });

  it('bodyTranslateOnOpenEnabled=true opens article and auto requests translation then auto enters translation view', async () => {
    const apiClient = await import('../../lib/apiClient');
    await seedArticleViewState({ bodyTranslateOnOpenEnabled: true });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    await waitFor(() => {
      expect(apiClient.enqueueArticleAiTranslate).toHaveBeenCalledWith('article-1', {
        force: false,
      });
    });

    expect(await screen.findAllByText('翻译中…')).not.toHaveLength(0);
  });
});
