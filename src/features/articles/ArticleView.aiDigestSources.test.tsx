import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from './ArticleView';
import { defaultPersistedSettings } from '../settings/settingsSchema';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';

type ApiClientModule = typeof import('../../lib/apiClient');

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
    enqueueArticlePrivateFm: vi.fn(),
    getArticlePrivateFm: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function resetStores() {
  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: {
      ...structuredClone(defaultPersistedSettings),
      general: {
        ...defaultPersistedSettings.general,
        autoMarkReadEnabled: false,
        autoMarkReadDelayMs: 0,
      },
    },
    sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
    draft: null,
    validationErrors: {},
    settings: structuredClone(defaultPersistedSettings.appearance),
  }));

  useAppStore.setState({
    feeds: [],
    categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
    articles: [],
    selectedView: 'all',
    selectedArticleId: null,
    sidebarCollapsed: false,
    snapshotLoading: false,
  });
}

function seedState(input: {
  feed: Record<string, unknown>;
  article: Record<string, unknown>;
  actions?: {
    loadSnapshot?: ReturnType<typeof vi.fn>;
    setSelectedView?: ReturnType<typeof vi.fn>;
    setSelectedArticle?: ReturnType<typeof vi.fn>;
  };
}) {
  const articleId = String(input.article.id ?? 'article-1');
  useAppStore.setState({
    feeds: [
      {
        id: 'feed-1',
        kind: 'ai_digest',
        title: '智能报告',
        url: 'https://example.com/feed.xml',
        unreadCount: 1,
        enabled: true,
        fullTextOnOpenEnabled: false,
        aiSummaryOnOpenEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        bodyTranslateOnOpenEnabled: false,
        titleTranslateEnabled: false,
        bodyTranslateEnabled: false,
        articleListDisplayMode: 'card',
        categoryId: null,
        category: null,
        fetchStatus: null,
        fetchError: null,
        ...input.feed,
      },
    ],
    articles: [
      {
        id: articleId,
        feedId: 'feed-1',
        title: 'Digest',
        content: '<p>digest</p>',
        summary: 'summary',
        publishedAt: '2026-03-17T00:00:00.000Z',
        link: 'https://example.com/digest',
        isRead: true,
        isStarred: false,
        ...input.article,
      },
    ],
    selectedView: 'all',
    selectedArticleId: articleId,
    refreshArticle: vi.fn().mockResolvedValue({
      hasFulltext: false,
      hasFulltextError: false,
      hasAiSummary: false,
      hasAiTranslation: false,
    }),
    loadSnapshot: input.actions?.loadSnapshot ?? vi.fn().mockResolvedValue(undefined),
    setSelectedView: input.actions?.setSelectedView ?? vi.fn(),
    setSelectedArticle: input.actions?.setSelectedArticle ?? vi.fn(),
    markAsRead: vi.fn(),
    toggleStar: vi.fn(),
  });
}

describe('ArticleView ai digest sources', () => {
  beforeEach(async () => {
    resetStores();

    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.enqueueArticlePrivateFm).mockReset();
    vi.mocked(apiClient.getArticlePrivateFm).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.enqueueArticleFulltext).mockResolvedValue({ enqueued: true, jobId: 'job-1' });
    vi.mocked(apiClient.enqueueArticlePrivateFm).mockResolvedValue({
      enqueued: true,
      jobId: 'private-fm-job-1',
      episodeId: 'episode-1',
    });
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({ episode: null });
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);
  });

  it('renders sources module only for ai_digest article', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-1',
        feedId: 'feed-digest',
        aiDigestSources: [
          {
            articleId: 'src-1',
            feedId: 'feed-rss-1',
            feedTitle: 'RSS 1',
            title: '来源 1',
            link: 'https://example.com/1',
            publishedAt: '2026-03-17T00:00:00.000Z',
            position: 0,
          },
        ],
      },
    });

    render(<ArticleView />);

    expect(await screen.findByText('来源')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /来源 1/ })).toBeInTheDocument();
  });

  it('renders source section after article html container for ai_digest article', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-order-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [
          {
            articleId: 'src-1',
            feedId: 'feed-rss-1',
            feedTitle: 'RSS 1',
            title: '来源 1',
            link: null,
            publishedAt: null,
            position: 0,
          },
        ],
      },
    });

    render(<ArticleView />);

    const articleHtml = await screen.findByTestId('article-html-content');
    const sourceSection = screen.getByTestId('ai-digest-sources-section');
    expect(
      articleHtml.compareDocumentPosition(sourceSection) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders private FM before article html for ai_digest article', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-order-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    const privateFmSection = await screen.findByTestId('private-fm-section');
    const articleHtml = screen.getByTestId('article-html-content');
    expect(
      privateFmSection.compareDocumentPosition(articleHtml) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('shows script-ready state while private FM audio is being generated', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({
      episode: {
        id: 'episode-1',
        status: 'script_ready',
        scriptText: '已有口播稿',
        audioUrl: null,
        audioParts: [],
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    });

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-script-ready-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    expect(await screen.findByText('口播稿已生成，正在生成音频')).toBeInTheDocument();
    expect(screen.getByText('生成中')).toBeInTheDocument();
  });

  it('shows audio generation state when a retry is queued with an existing script', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({
      episode: {
        id: 'episode-1',
        status: 'queued',
        scriptText: '已有口播稿',
        audioUrl: null,
        audioParts: [],
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    });

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-queued-with-script-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    expect(await screen.findByText('口播稿已生成，正在生成音频')).toBeInTheDocument();
    expect(screen.queryByText('正在生成口播稿')).not.toBeInTheDocument();
  });

  it('plays merged private FM audio as a single track when available', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({
      episode: {
        id: 'episode-1',
        status: 'succeeded',
        scriptText: '已有口播稿',
        audioUrl: '/api/private-fm/episodes/episode-1/audio/full',
        audioParts: [
          { index: 0, url: '/api/private-fm/episodes/episode-1/audio/0' },
          { index: 1, url: '/api/private-fm/episodes/episode-1/audio/1' },
        ],
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    });

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-merged-audio-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    expect(await screen.findByText('已生成完整音频')).toBeInTheDocument();
    const audio = document.querySelector('audio');
    expect(audio).toHaveAttribute('src', '/api/private-fm/episodes/episode-1/audio/full');
    expect(screen.queryByText(/正在播放第/)).not.toBeInTheDocument();
  });

  it('allows retry when a private FM pending state is stale', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({
      episode: {
        id: 'episode-1',
        status: 'queued',
        scriptText: null,
        audioUrl: null,
        audioParts: [],
        errorCode: null,
        errorMessage: null,
        updatedAt: '2026-03-17T00:00:00.000Z',
      },
    });

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-stale-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    expect(await screen.findByText('生成超时，请重试')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));

    await waitFor(() => {
      expect(apiClient.enqueueArticlePrivateFm).toHaveBeenCalledWith('digest-fm-stale-1', {
        mode: 'retry',
      });
    });
  });

  it('retries a failed private FM episode without regenerating script', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.getArticlePrivateFm).mockResolvedValue({
      episode: {
        id: 'episode-1',
        status: 'failed',
        scriptText: '已有口播稿',
        audioUrl: null,
        audioParts: [],
        errorCode: 'stepfun_error',
        errorMessage: '音频生成失败',
        updatedAt: '2026-03-17T00:00:00.000Z',
      },
    });

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-fm-retry-1',
        feedId: 'feed-digest',
        content: '<p>digest body</p>',
        aiDigestSources: [],
      },
    });

    render(<ArticleView />);

    fireEvent.click(await screen.findByRole('button', { name: /重试/ }));

    await waitFor(() => {
      expect(apiClient.enqueueArticlePrivateFm).toHaveBeenCalledWith('digest-fm-retry-1', {
        mode: 'retry',
      });
    });
  });

  it('hides sources module for non-ai_digest article', async () => {
    seedState({
      feed: { id: 'feed-rss', kind: 'rss', title: 'RSS' },
      article: { id: 'rss-1', feedId: 'feed-rss', aiDigestSources: [] },
    });

    render(<ArticleView />);

    await waitFor(() => {
      expect(screen.queryByText('来源')).not.toBeInTheDocument();
    });
  });

  it('shows empty state for ai_digest article without sources', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: { id: 'digest-2', feedId: 'feed-digest', aiDigestSources: [] },
    });

    render(<ArticleView />);

    expect(await screen.findByText('暂无来源记录')).toBeInTheDocument();
  });

  it('uses an internal scroll container when sources exceed three items', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-4',
        feedId: 'feed-digest',
        aiDigestSources: [
          {
            articleId: 'src-1',
            feedId: 'feed-rss-1',
            feedTitle: 'RSS 1',
            title: '来源 1',
            link: 'https://example.com/1',
            publishedAt: '2026-03-17T00:00:00.000Z',
            position: 0,
          },
          {
            articleId: 'src-2',
            feedId: 'feed-rss-2',
            feedTitle: 'RSS 2',
            title: '来源 2',
            link: 'https://example.com/2',
            publishedAt: '2026-03-16T00:00:00.000Z',
            position: 1,
          },
          {
            articleId: 'src-3',
            feedId: 'feed-rss-3',
            feedTitle: 'RSS 3',
            title: '来源 3',
            link: 'https://example.com/3',
            publishedAt: '2026-03-15T00:00:00.000Z',
            position: 2,
          },
          {
            articleId: 'src-4',
            feedId: 'feed-rss-4',
            feedTitle: 'RSS 4',
            title: '来源 4',
            link: 'https://example.com/4',
            publishedAt: '2026-03-14T00:00:00.000Z',
            position: 3,
          },
        ],
      },
    });

    render(<ArticleView />);

    const scrollContainer = await screen.findByTestId('ai-digest-sources-scroll-container');
    expect(scrollContainer).toHaveClass('overflow-y-auto');
    expect(scrollContainer).toHaveClass('max-h-[13.5rem]');
    expect(screen.getByRole('button', { name: /来源 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /来源 2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /来源 3/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /来源 4/ })).toBeInTheDocument();
  });

  it('clicking source item preserves back history by using none->push navigation semantics', async () => {
    const loadSnapshot = vi.fn().mockResolvedValue(undefined);
    const setSelectedView = vi.fn();
    const setSelectedArticle = vi.fn();

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: '智能报告' },
      article: {
        id: 'digest-3',
        feedId: 'feed-digest',
        aiDigestSources: [
          {
            articleId: 'src-1',
            feedId: 'feed-rss-1',
            feedTitle: 'RSS 1',
            title: '来源 1',
            link: 'https://example.com/1',
            publishedAt: '2026-03-17T00:00:00.000Z',
            position: 0,
          },
        ],
      },
      actions: {
        loadSnapshot,
        setSelectedView,
        setSelectedArticle,
      },
    });

    render(<ArticleView />);

    fireEvent.click(await screen.findByRole('button', { name: /来源 1/ }));

    await waitFor(() => {
      expect(setSelectedView).toHaveBeenCalledWith('feed-rss-1', { history: 'none' });
      expect(loadSnapshot).toHaveBeenCalledWith({ view: 'feed-rss-1' });
      expect(setSelectedArticle).toHaveBeenCalledWith('src-1', { history: 'push' });
    });
  });
});
