import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ApiClientModule = typeof import('../../lib/apiClient');
type ArticleViewModule = typeof import('./ArticleView');
type AppStoreModule = typeof import('../../store/appStore');
type SettingsStoreModule = typeof import('../../store/settingsStore');

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

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('../../lib/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    enqueueArticleAiSummary: vi.fn(),
    getArticleAiSummarySnapshot: vi.fn(),
    createArticleAiSummaryEventSource: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function seedArticleViewState(input?: {
  feed?: Record<string, unknown>;
  article?: Record<string, unknown>;
}) {
  return import('../../store/appStore').then(({ useAppStore }) => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled: true,
          bodyTranslateOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          category: null,
          ...input?.feed,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
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

describe('ArticleView ai summary', () => {
  let ArticleView: ArticleViewModule['default'];
  let useAppStore: AppStoreModule['useAppStore'];
  let useSettingsStore: SettingsStoreModule['useSettingsStore'];
  let enqueueArticleFulltextMock: ReturnType<typeof vi.fn>;
  let enqueueArticleAiSummaryMock: ReturnType<typeof vi.fn>;
  let getArticleAiSummarySnapshotMock: ReturnType<typeof vi.fn>;
  let createArticleAiSummaryEventSourceMock: ReturnType<typeof vi.fn>;
  let getArticleTasksMock: ReturnType<typeof vi.fn>;
  let fakeEventSource: FakeEventSource;

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();
    fakeEventSource = new FakeEventSource();

    const apiClient = await import('../../lib/apiClient');
    enqueueArticleFulltextMock = vi.mocked(apiClient.enqueueArticleFulltext);
    enqueueArticleAiSummaryMock = vi.mocked(apiClient.enqueueArticleAiSummary);
    getArticleAiSummarySnapshotMock = vi.mocked(apiClient.getArticleAiSummarySnapshot);
    createArticleAiSummaryEventSourceMock = vi.mocked(apiClient.createArticleAiSummaryEventSource);
    getArticleTasksMock = vi.mocked(apiClient.getArticleTasks);
    enqueueArticleFulltextMock.mockReset();
    enqueueArticleAiSummaryMock.mockReset();
    getArticleAiSummarySnapshotMock.mockReset();
    createArticleAiSummaryEventSourceMock.mockReset();
    getArticleTasksMock.mockReset();

    enqueueArticleFulltextMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-1',
    });
    enqueueArticleAiSummaryMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-summary-1',
      sessionId: 'session-1',
    });
    getArticleAiSummarySnapshotMock.mockResolvedValue({
      session: {
        id: 'session-1',
        status: 'running',
        draftText: 'TL;DR',
        finalText: null,
        errorCode: null,
        errorMessage: null,
        startedAt: '2026-03-09T00:00:00.000Z',
        finishedAt: null,
        updatedAt: '2026-03-09T00:00:00.000Z',
      },
    });
    createArticleAiSummaryEventSourceMock.mockImplementation(
      () => fakeEventSource as unknown as EventSource,
    );
    getArticleTasksMock.mockResolvedValue(idleTasks);

    ({ default: ArticleView } = await import('./ArticleView'));
    ({ useAppStore } = await import('../../store/appStore'));
    ({ useSettingsStore } = await import('../../store/settingsStore'));

    const persisted = useSettingsStore.getState().persistedSettings;
    useSettingsStore.setState({
      persistedSettings: {
        ...persisted,
        general: {
          ...persisted.general,
          autoMarkReadEnabled: false,
          autoMarkReadDelayMs: 0,
        },
      },
    });

    useAppStore.setState({
      refreshArticle: vi.fn().mockResolvedValue({
        hasFulltext: false,
        hasFulltextError: false,
        hasAiSummary: false,
        hasAiTranslation: false,
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('自动模式打开文章会触发摘要入队', async () => {
    enqueueArticleAiSummaryMock.mockResolvedValue({
      enqueued: false,
      reason: 'missing_api_key',
    });

    const refreshArticleMock = vi.fn().mockResolvedValue({
      hasFulltext: false,
      hasFulltextError: false,
      hasAiSummary: false,
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: true,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      refreshArticle: refreshArticleMock,
    });

    render(<ArticleView />);

    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1');
    });
  });

  it('plays summary delta in chunks instead of rendering the full block immediately', async () => {
    await seedArticleViewState({
      feed: { aiSummaryOnOpenEnabled: true },
    });

    render(<ArticleView />);

    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1');
    });
    await waitFor(() => {
      expect(getArticleAiSummarySnapshotMock).toHaveBeenCalledWith('article-1');
    });
    await waitFor(() => {
      expect(createArticleAiSummaryEventSourceMock).toHaveBeenCalledWith('article-1');
    });

    await act(async () => {
      fakeEventSource.emit('summary.snapshot', { draftText: 'TL;DR' });
    });
    expect(screen.getByText('TL;DR')).toBeInTheDocument();

    vi.useFakeTimers();

    await act(async () => {
      fakeEventSource.emit('summary.delta', { deltaText: '\n- 第一条' });
    });

    const summaryCard = screen.getByLabelText('AI 摘要');
    expect(summaryCard.textContent).toContain('TL;DR');
    expect(summaryCard.textContent).not.toContain('TL;DR - 第一条');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(summaryCard.textContent).toContain('TL;DR - 第一条');
  });

  it('生成流式摘要时不会额外轮询 article tasks', async () => {
    await seedArticleViewState();

    render(<ArticleView />);

    await waitFor(() => {
      expect(getArticleTasksMock).toHaveBeenCalledTimes(1);
    });
    const initialTaskRequestCount = getArticleTasksMock.mock.calls.length;

    fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }));

    await waitFor(() => {
      expect(getArticleAiSummarySnapshotMock).toHaveBeenCalledWith('article-1');
    });
    await waitFor(() => {
      expect(createArticleAiSummaryEventSourceMock).toHaveBeenCalledWith('article-1');
    });

    vi.useFakeTimers();

    await act(async () => {
      fakeEventSource.emit('summary.delta', { deltaText: '\n- 第一条' });
    });

    const summaryCard = screen.getByLabelText('AI 摘要');
    expect(summaryCard.textContent).toContain('TL;DR');
    expect(summaryCard.textContent).not.toContain('TL;DR - 第一条');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(summaryCard.textContent).toContain('TL;DR - 第一条');
    expect(getArticleTasksMock).toHaveBeenCalledTimes(initialTaskRequestCount);
  });

  it('手动模式下全文 pending 时禁用按钮，失败后可点击触发摘要', async () => {
    enqueueArticleFulltextMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-1',
    });
    enqueueArticleAiSummaryMock.mockResolvedValue({
      enqueued: false,
      reason: 'missing_api_key',
    });

    getArticleTasksMock
      .mockResolvedValueOnce({
        fulltext: { type: 'fulltext', status: 'running', jobId: 'job-fulltext-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        ai_summary: { type: 'ai_summary', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      })
      .mockResolvedValueOnce({
        fulltext: { type: 'fulltext', status: 'running', jobId: 'job-fulltext-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        ai_summary: { type: 'ai_summary', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      })
      .mockResolvedValue({
        fulltext: { type: 'fulltext', status: 'failed', jobId: 'job-fulltext-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 1, errorCode: 'fetch_timeout', errorMessage: '抓取超时' },
        ai_summary: { type: 'ai_summary', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      });

    const refreshArticleMock = vi.fn().mockResolvedValue({
      hasFulltext: false,
      hasFulltextError: false,
      hasAiSummary: false,
      hasAiTranslation: false,
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: true,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      refreshArticle: refreshArticleMock,
    });

    render(<ArticleView />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成摘要' })).toBeDisabled();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成摘要' })).toBeEnabled();
    }, { timeout: 3000 });

    fireEvent.click(screen.getByRole('button', { name: '生成摘要' }));
    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1', { force: true });
    });
  });

  it('AI 摘要按钮在已有摘要时仍会强制重跑', async () => {
    enqueueArticleAiSummaryMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-summary-1',
    });
    getArticleTasksMock.mockResolvedValue({
      fulltext: {
        type: 'fulltext',
        status: 'idle',
        jobId: null,
        requestedAt: null,
        startedAt: null,
        finishedAt: null,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      ai_summary: {
        type: 'ai_summary',
        status: 'succeeded',
        jobId: 'job-summary-1',
        requestedAt: null,
        startedAt: null,
        finishedAt: null,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
      },
      ai_translate: {
        type: 'ai_translate',
        status: 'idle',
        jobId: null,
        requestedAt: null,
        startedAt: null,
        finishedAt: null,
        attempts: 0,
        errorCode: null,
        errorMessage: null,
      },
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          aiSummary: '已有摘要',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }));
    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1', { force: true });
    });
  });

  it('存在运行中的 aiSummarySession 时隐藏旧摘要并显示新草稿', async () => {
    await seedArticleViewState({
      article: {
        aiSummary: '旧摘要',
        aiSummarySession: {
          id: 'session-2',
          status: 'running',
          draftText: 'TL;DR',
          finalText: null,
          errorCode: null,
          errorMessage: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-09T00:00:10.000Z',
        },
      },
    });

    await act(async () => {
      render(<ArticleView />);
    });

    expect(screen.queryByText('旧摘要')).not.toBeInTheDocument();
    expect(screen.getByText('TL;DR')).toBeInTheDocument();
    expect(screen.getByText('正在生成摘要')).toBeInTheDocument();
  });

  it('重新进入文章时会先显示运行中的摘要草稿并继续接收 SSE', async () => {
    await seedArticleViewState({
      article: {
        aiSummarySession: {
          id: 'session-2',
          status: 'running',
          draftText: 'TL;DR',
          finalText: null,
          errorCode: null,
          errorMessage: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-09T00:00:10.000Z',
        },
      },
    });

    render(<ArticleView />);

    expect(screen.getByText('TL;DR')).toBeInTheDocument();
    await waitFor(() => {
      expect(createArticleAiSummaryEventSourceMock).toHaveBeenCalledWith('article-1');
    });

    vi.useFakeTimers();

    await act(async () => {
      fakeEventSource.emit('summary.delta', { deltaText: '\n- 第一条' });
    });

    const summaryCard = screen.getByLabelText('AI 摘要');
    expect(summaryCard.textContent).toContain('TL;DR');
    expect(summaryCard.textContent).not.toContain('TL;DR - 第一条');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(summaryCard.textContent).toContain('TL;DR - 第一条');
  });

  it('摘要失败时保留草稿并显示错误与重试', async () => {
    await seedArticleViewState({
      article: {
        aiSummarySession: {
          id: 'session-3',
          status: 'failed',
          draftText: 'TL;DR',
          finalText: null,
          errorCode: 'ai_timeout',
          errorMessage: '请求超时',
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: '2026-03-09T00:00:30.000Z',
          updatedAt: '2026-03-09T00:00:30.000Z',
        },
      },
    });

    render(<ArticleView />);

    expect(screen.getByText('TL;DR')).toBeInTheDocument();
    expect(screen.getByText('请求超时')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1', { force: true });
    });
  });

  it('自动全文抓取关闭时仍显示抓取全文按钮，并允许手动触发', async () => {
    enqueueArticleFulltextMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-manual-1',
    });
    getArticleTasksMock
      .mockResolvedValueOnce(idleTasks)
      .mockResolvedValueOnce({
        ...idleTasks,
        fulltext: {
          ...idleTasks.fulltext,
          status: 'succeeded',
          jobId: 'job-fulltext-manual-1',
        },
      });

    const refreshArticleMock = vi.fn().mockResolvedValue({
      hasFulltext: true,
      hasFulltextError: false,
      hasAiSummary: false,
      hasAiTranslation: false,
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      refreshArticle: refreshArticleMock,
    });

    render(<ArticleView />);

    fireEvent.click(await screen.findByRole('button', { name: '抓取全文' }));

    await waitFor(() => {
      expect(enqueueArticleFulltextMock).toHaveBeenCalledWith('article-1', { force: true });
    });
  });

  it('自动摘要开启时仍显示 AI 摘要按钮', async () => {
    enqueueArticleAiSummaryMock.mockResolvedValue({
      enqueued: false,
      reason: 'missing_api_key',
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: true,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    expect(await screen.findByRole('button', { name: '生成摘要' })).toBeInTheDocument();
  });

  it('moves desktop article actions into a fixed toolbar and keeps settings callback wired', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
    const onOpenSettings = vi.fn();
    await seedArticleViewState();

    render(<ArticleView onOpenSettings={onOpenSettings} />);

    const toolbar = await screen.findByTestId('article-desktop-toolbar');
    expect(toolbar.className).not.toContain('border-b');
    expect(screen.queryByText('抓取全文')).not.toBeInTheDocument();
    expect(screen.queryByText('生成摘要')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '打开原文：Article 1' })).not.toBeInTheDocument();

    const settingsButton = await screen.findByRole('button', { name: '打开设置' });
    fireEvent.focus(settingsButton);
    expect(await screen.findByText('打开设置')).toBeInTheDocument();

    const scrollContainer = screen.getByTestId('article-scroll-container');
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
    scrollContainer.scrollTop = 120;
    fireEvent.scroll(scrollContainer);

    expect(await screen.findByRole('link', { name: '打开原文：Article 1' })).toBeInTheDocument();

    fireEvent.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps inline text action buttons on non-desktop article view', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    await seedArticleViewState();

    render(<ArticleView reserveTopSpace={false} />);

    expect(await screen.findByText('抓取全文')).toBeInTheDocument();
    expect(screen.getByText('生成摘要')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '打开设置' })).not.toBeInTheDocument();
  });

  it('三个操作按钮展示扁平化交互样式', async () => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    await screen.findByRole('button', { name: '生成摘要' });

    const starButton = screen.getByRole('button', { name: '收藏' });
    const translateButton = screen.getByRole('button', { name: '翻译' });
    const aiSummaryButton = screen.getByRole('button', { name: '生成摘要' });

    expect(starButton).toHaveClass('cursor-pointer');
    expect(translateButton).toHaveClass('cursor-pointer');
    expect(aiSummaryButton).toHaveClass('cursor-pointer');
    expect(starButton.className).not.toContain('hover:shadow-md');
    expect(translateButton.className).not.toContain('hover:shadow-md');
    expect(aiSummaryButton.className).not.toContain('hover:shadow-md');
  });

  it('点击 AI 摘要区域任意位置可展开和收起', async () => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          aiSummary: '第一段\n第二段\n第三段',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    expect(await screen.findByRole('button', { name: '展开摘要' })).toBeInTheDocument();

    const aiSummaryCard = screen.getByLabelText('AI 摘要');
    fireEvent.click(aiSummaryCard);
    expect(screen.getByRole('button', { name: '收起摘要' })).toBeInTheDocument();
    expect(screen.getByText('第三段')).toBeInTheDocument();

    fireEvent.click(aiSummaryCard);
    expect(screen.getByRole('button', { name: '展开摘要' })).toBeInTheDocument();
  });

  it('ai summary failed shows persisted error and retry calls enqueue', async () => {
    enqueueArticleAiSummaryMock.mockResolvedValue({ enqueued: true, jobId: 'job-1' });
    getArticleTasksMock.mockResolvedValue({
      fulltext: { type: 'fulltext', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      ai_summary: { type: 'ai_summary', status: 'failed', jobId: 'job-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 1, errorCode: 'ai_timeout', errorMessage: '请求超时' },
      ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    expect(await screen.findByText('请求超时')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledWith('article-1', { force: true });
    });
    expect(await screen.findByText('TL;DR')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('请求超时')).not.toBeInTheDocument();
    });
  });

  it('wraps long ai summary failure messages without squeezing out retry action', async () => {
    const longError =
      '摘要生成失败：这是一个非常非常长的错误消息🙂 مع رسالة خطأ طويلة للغاية with extra details to verify wrapping behavior';

    getArticleTasksMock.mockResolvedValue({
      fulltext: { type: 'fulltext', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      ai_summary: { type: 'ai_summary', status: 'failed', jobId: 'job-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 1, errorCode: 'ai_timeout', errorMessage: longError },
      ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
    });

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    render(<ArticleView />);

    const errorMessage = await screen.findByText(longError);
    expect(errorMessage).toHaveClass('min-w-0');
    expect(errorMessage).toHaveClass('break-words');
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
