import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArticleView from './ArticleView';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { defaultPersistedSettings } from '../settings/settingsSchema';

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
    enqueueArticleAiSummary: vi.fn(),
    enqueueArticleFulltext: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

function setupResizeObserverMock() {
  const original = globalThis.ResizeObserver;

  class MockResizeObserver {
    constructor() {}

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);

  return {
    restore() {
      if (original) {
        vi.stubGlobal('ResizeObserver', original);
        return;
      }

      vi.unstubAllGlobals();
    },
  };
}

async function renderArticleView() {
  const view = render(<ArticleView />);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

describe('ArticleView scroll assist', () => {
  let resizeObserver: ReturnType<typeof setupResizeObserverMock>;

  beforeEach(async () => {
    resizeObserver = setupResizeObserverMock();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });

    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleAiSummary).mockReset();
    vi.mocked(apiClient.enqueueArticleFulltext).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockReset();
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue(idleTasks);

    useSettingsStore.setState((state) => ({
      ...state,
      persistedSettings: {
        ...structuredClone(defaultPersistedSettings),
        general: {
          ...structuredClone(defaultPersistedSettings.general),
          autoMarkReadEnabled: false,
          autoMarkReadDelayMs: 0,
        },
      },
    }));

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: 'cat-uncategorized',
          category: '未分类',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<h2>Overview</h2><p>A</p><h3>Details</h3><p>B</p>',
          summary: 'summary',
          publishedAt: new Date('2026-03-07T00:00:00.000Z').toISOString(),
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

  afterEach(() => {
    resizeObserver.restore();
  });

  it('does not render the scroll assist while the title is still visible', async () => {
    await renderArticleView();

    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '回到顶部' })).not.toBeInTheDocument();
  });

  it('renders the scroll assist after the article title leaves the viewport', async () => {
    await renderArticleView();
    const scrollContainer = await screen.findByTestId('article-scroll-container');

    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
    scrollContainer.scrollTop = 240;

    fireEvent.scroll(scrollContainer);

    expect(await screen.findByText('20%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '回到顶部' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: '文章目录' })).not.toBeInTheDocument();
  });

  it('scrolls the article container to top when the back-to-top button is clicked', async () => {
    await renderArticleView();
    const scrollContainer = await screen.findByTestId('article-scroll-container');
    const scrollTo = vi.fn();

    Object.defineProperty(scrollContainer, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2400, configurable: true });
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 1200, configurable: true });
    scrollContainer.scrollTop = 240;

    fireEvent.scroll(scrollContainer);
    fireEvent.click(await screen.findByRole('button', { name: '回到顶部' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
