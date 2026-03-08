import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('../../lib/apiClient');
  return {
    ...actual,
    enqueueArticleFulltext: vi.fn(),
    enqueueArticleAiSummary: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

describe('ArticleView ai summary', () => {
  let ArticleView: ArticleViewModule['default'];
  let useAppStore: AppStoreModule['useAppStore'];
  let useSettingsStore: SettingsStoreModule['useSettingsStore'];
  let enqueueArticleFulltextMock: ReturnType<typeof vi.fn>;
  let enqueueArticleAiSummaryMock: ReturnType<typeof vi.fn>;
  let getArticleTasksMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.useRealTimers();

    const apiClient = await import('../../lib/apiClient');
    enqueueArticleFulltextMock = vi.mocked(apiClient.enqueueArticleFulltext);
    enqueueArticleAiSummaryMock = vi.mocked(apiClient.enqueueArticleAiSummary);
    getArticleTasksMock = vi.mocked(apiClient.getArticleTasks);
    enqueueArticleFulltextMock.mockReset();
    enqueueArticleAiSummaryMock.mockReset();
    getArticleTasksMock.mockReset();

    enqueueArticleFulltextMock.mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-1',
    });
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

    const aiSummaryButton = await screen.findByRole('button', { name: '生成摘要' });
    await waitFor(() => {
      expect(aiSummaryButton).toBeDisabled();
    });

    await waitFor(() => {
      expect(aiSummaryButton).toBeEnabled();
    }, { timeout: 3000 });

    fireEvent.click(aiSummaryButton);
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

  it('三个操作按钮都不显示 hover tip', async () => {
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

    const translateButton = screen.getByRole('button', { name: '翻译' });
    const aiSummaryButton = screen.getByRole('button', { name: '生成摘要' });

    fireEvent.focus(translateButton);
    fireEvent.focus(aiSummaryButton);

    await waitFor(() => {
      expect(screen.queryByText('翻译功能即将上线')).not.toBeInTheDocument();
      expect(screen.queryByText('基于文章内容生成中文摘要')).not.toBeInTheDocument();
    });
  });

  it('三个操作按钮展示可点击的 hover 状态', async () => {
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

    expect(starButton).toHaveClass('hover:shadow-md');
    expect(translateButton).toHaveClass('hover:shadow-md');
    expect(aiSummaryButton).toHaveClass('hover:shadow-md');
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

    fireEvent.click(await screen.findByRole('button', { name: '生成摘要' }));
    expect(await screen.findByText('请求超时')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    await waitFor(() => {
      expect(enqueueArticleAiSummaryMock).toHaveBeenCalledTimes(2);
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
