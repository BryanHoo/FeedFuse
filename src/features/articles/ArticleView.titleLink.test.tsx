import { act, render, screen, waitFor } from '@testing-library/react';
import { Profiler } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

import ArticleView from './ArticleView';
import { defaultPersistedSettings } from '../settings/settingsSchema';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';

function resetStores() {
  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: structuredClone(defaultPersistedSettings),
    sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
    draft: null,
    validationErrors: {},
    settings: structuredClone(defaultPersistedSettings.appearance),
  }));
  window.localStorage.clear();

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

describe('ArticleView title link', () => {
  beforeEach(async () => {
    resetStores();

    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.enqueueArticleFulltext).mockResolvedValue({
      enqueued: true,
      jobId: 'job-fulltext-1',
    });
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);
  });

  it('removes the 原文 action and makes article title open original link', async () => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          icon: 'https://example.com/favicon.ico',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await act(async () => {
      render(<ArticleView />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const apiClient = await import('../../lib/apiClient');
    await waitFor(() => {
      expect(apiClient.getArticleTasks).toHaveBeenCalledWith('article-1');
    });

    expect(screen.queryByRole('link', { name: '原文' })).not.toBeInTheDocument();

    const titleLink = screen.getByRole('link', { name: 'Article 1' });
    expect(titleLink).toHaveAttribute('href', 'https://example.com/a1');
    expect(titleLink).toHaveAttribute('target', '_blank');
    expect(titleLink).toHaveAttribute('rel', 'noopener noreferrer');

    expect(screen.queryByText('https://example.com/favicon.ico')).not.toBeInTheDocument();
    const feedIcon = screen.getByTestId('article-feed-icon');
    expect(feedIcon).toHaveAttribute('src', 'https://example.com/favicon.ico');
  });

  it('wraps long mixed-language title and metadata without overflowing action layout', async () => {
    const longTitle =
      '这是一篇非常非常长的文章标题🙂 مع عنوان عربي طويل للغاية with extra German compound words Donaudampfschifffahrtsgesellschaft';
    const longFeedTitle =
      '来源名称非常非常长🙂 مع اسم مصدر طويل للغاية for layout hardening';
    const longAuthor = '作者名字非常非常长🙂 مع اسم كاتب طويل للغاية';

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: longFeedTitle,
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: longTitle,
          author: longAuthor,
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await act(async () => {
      render(<ArticleView />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const titleLink = screen.getByRole('link', { name: longTitle });
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('break-words');
    expect(titleLink).toHaveClass('max-w-full');
    expect(titleLink).toHaveClass('break-words');
    expect(screen.getByText(longFeedTitle)).toHaveClass('break-words');
    expect(screen.getByText(longAuthor)).toHaveClass('break-words');
  });

  it('shows filtered badge in article metadata when the article is filtered', async () => {
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
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/a1',
          filterStatus: 'filtered',
          isFiltered: true,
          filteredBy: ['keyword'],
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await act(async () => {
      render(<ArticleView />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId('article-filter-badge')).toHaveTextContent('已过滤');
  });

  it('uses fixed horizontal padding and adds more left space on wide screens', async () => {
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
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await act(async () => {
      render(<ArticleView />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const articleContentShell = screen.getByTestId('article-content-shell');
    expect(articleContentShell).toHaveClass('px-8');
    expect(articleContentShell).toHaveClass('lg:pl-12');
    expect(articleContentShell).toHaveClass('lg:pr-8');
    expect(articleContentShell).toHaveClass('w-full');
    expect(articleContentShell).not.toHaveClass('max-w-3xl');
  });

  it('does not commit again when unrelated app store state changes', async () => {
    let commitCount = 0;

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          icon: 'https://example.com/favicon.ico',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>content</p>',
          summary: 'summary',
          publishedAt: new Date().toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    await act(async () => {
      render(
        <Profiler
          id="article-view"
          onRender={() => {
            commitCount += 1;
          }}
        >
          <ArticleView />
        </Profiler>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const apiClient = await import('../../lib/apiClient');
    await waitFor(() => {
      expect(apiClient.getArticleTasks).toHaveBeenCalledWith('article-1');
    });

    const baselineCommitCount = commitCount;

    act(() => {
      useAppStore.setState({ sidebarCollapsed: true });
    });

    expect(commitCount).toBe(baselineCommitCount);
  });
});
