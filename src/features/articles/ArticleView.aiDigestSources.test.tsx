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
        title: 'AI解读',
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
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.enqueueArticleFulltext).mockResolvedValue({ enqueued: true, jobId: 'job-1' });
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);
  });

  it('renders sources module only for ai_digest article', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: 'AI解读' },
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

  it('hides sources module for non-ai_digest article', () => {
    seedState({
      feed: { id: 'feed-rss', kind: 'rss', title: 'RSS' },
      article: { id: 'rss-1', feedId: 'feed-rss', aiDigestSources: [] },
    });

    render(<ArticleView />);

    expect(screen.queryByText('来源')).not.toBeInTheDocument();
  });

  it('shows empty state for ai_digest article without sources', async () => {
    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: 'AI解读' },
      article: { id: 'digest-2', feedId: 'feed-digest', aiDigestSources: [] },
    });

    render(<ArticleView />);

    expect(await screen.findByText('暂无来源记录')).toBeInTheDocument();
  });

  it('clicking source item switches view, reloads snapshot and selects article', async () => {
    const loadSnapshot = vi.fn().mockResolvedValue(undefined);
    const setSelectedView = vi.fn();
    const setSelectedArticle = vi.fn();

    seedState({
      feed: { id: 'feed-digest', kind: 'ai_digest', title: 'AI解读' },
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
      expect(setSelectedView).toHaveBeenCalledWith('feed-rss-1');
      expect(loadSnapshot).toHaveBeenCalledWith({ view: 'feed-rss-1' });
      expect(setSelectedArticle).toHaveBeenCalledWith('src-1');
    });
  });
});
