import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ApiClientModule = typeof import('../../lib/apiClient');
type AppStoreModule = typeof import('../../store/appStore');
type SettingsStoreModule = typeof import('../../store/settingsStore');
type ToastStoreModule = typeof import('../toast/toastStore');
type ArticleViewModule = typeof import('./ArticleView');

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
    rawErrorMessage: null,
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
    rawErrorMessage: null,
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
    rawErrorMessage: null,
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

describe('ArticleView markdown export', () => {
  let ArticleView: ArticleViewModule['default'];
  let useAppStore: AppStoreModule['useAppStore'];
  let useSettingsStore: SettingsStoreModule['useSettingsStore'];
  let toastStore: ToastStoreModule['toastStore'];

  beforeEach(async () => {
    vi.resetModules();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });

    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

    ({ default: ArticleView } = await import('./ArticleView'));
    ({ useAppStore } = await import('../../store/appStore'));
    ({ useSettingsStore } = await import('../../store/settingsStore'));
    ({ toastStore } = await import('../toast/toastStore'));

    toastStore.getState().reset();

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
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Export / Article',
          content: '<p>Hello <strong>world</strong></p>',
          summary: 'summary',
          publishedAt: new Date('2026-03-21T10:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
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

  it('shows the export action in the desktop toolbar when an article is selected', async () => {
    render(<ArticleView />);

    expect(await screen.findByRole('button', { name: '导出文章' })).toBeInTheDocument();
  });

  it('does not show the export action when no article is selected', async () => {
    useAppStore.setState({ selectedArticleId: null });

    render(<ArticleView />);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '导出文章' })).not.toBeInTheDocument();
    });
  });

  it('downloads a markdown file when export is clicked', async () => {
    const createObjectURL = vi.fn(() => 'blob:article');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName);
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: anchorClick,
        });
      }
      return element;
    });

    render(<ArticleView />);

    fireEvent.click(await screen.findByRole('button', { name: '导出文章' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
