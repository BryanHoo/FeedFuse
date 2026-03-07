import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import ArticleView from './ArticleView';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { defaultPersistedSettings } from '../settings/settingsSchema';

function setupResizeObserverMock() {
  const original = globalThis.ResizeObserver;
  let callback: ResizeObserverCallback = () => undefined;

  class MockResizeObserver {
    constructor(nextCallback: ResizeObserverCallback) {
      callback = nextCallback;
    }

    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver as unknown as typeof ResizeObserver);

  return {
    trigger() {
      callback([], {} as ResizeObserver);
    },
    restore() {
      if (original) {
        vi.stubGlobal('ResizeObserver', original);
        return;
      }

      vi.unstubAllGlobals();
    },
  };
}

async function renderArticleViewWithHeadings() {
  const view = render(<ArticleView />);

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  return view;
}

describe('ArticleView outline panel', () => {
  let resizeObserver: ReturnType<typeof setupResizeObserverMock>;

  beforeEach(async () => {
    resizeObserver = setupResizeObserverMock();

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

  it('renders the outline panel for long articles without requiring hover', async () => {
    await renderArticleViewWithHeadings();

    const scrollContainer = await screen.findByTestId('article-scroll-container');
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 800 });

    const articleContent = await screen.findByTestId('article-html-content');
    Object.defineProperty(articleContent, 'scrollHeight', { configurable: true, value: 1400 });

    const contentShell = await screen.findByTestId('article-content-shell');
    contentShell.getBoundingClientRect = () => ({
      left: 120,
      right: 820,
      top: 0,
      bottom: 0,
      width: 700,
      height: 1200,
      x: 120,
      y: 0,
      toJSON: () => ({}),
    });

    const articleViewport = await screen.findByTestId('article-viewport');
    articleViewport.getBoundingClientRect = () => ({
      left: 0,
      right: 1120,
      top: 0,
      bottom: 900,
      width: 1120,
      height: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeObserver.trigger();
      await Promise.resolve();
    });

    expect(await screen.findByRole('navigation', { name: '文章目录' })).toBeInTheDocument();
  });

  it('hides the outline panel for short articles even when headings exist', async () => {
    await renderArticleViewWithHeadings();

    const scrollContainer = await screen.findByTestId('article-scroll-container');
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 800 });

    const articleContent = await screen.findByTestId('article-html-content');
    Object.defineProperty(articleContent, 'scrollHeight', { configurable: true, value: 900 });

    await act(async () => {
      resizeObserver.trigger();
      await Promise.resolve();
    });

    expect(screen.queryByRole('navigation', { name: '文章目录' })).not.toBeInTheDocument();
  });

  it('keeps the outline panel visible when the right-side gap can still fit a narrowed panel', async () => {
    await renderArticleViewWithHeadings();

    const scrollContainer = await screen.findByTestId('article-scroll-container');
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 800 });

    const articleContent = await screen.findByTestId('article-html-content');
    Object.defineProperty(articleContent, 'scrollHeight', { configurable: true, value: 1400 });

    const contentShell = await screen.findByTestId('article-content-shell');
    contentShell.getBoundingClientRect = () => ({
      left: 80,
      right: 860,
      top: 0,
      bottom: 0,
      width: 780,
      height: 1200,
      x: 80,
      y: 0,
      toJSON: () => ({}),
    });

    const articleViewport = await screen.findByTestId('article-viewport');
    articleViewport.getBoundingClientRect = () => ({
      left: 0,
      right: 1080,
      top: 0,
      bottom: 900,
      width: 1080,
      height: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeObserver.trigger();
      await Promise.resolve();
    });

    expect(await screen.findByRole('navigation', { name: '文章目录' })).toBeInTheDocument();
  });

  it('scrolls the article container when an outline item is clicked', async () => {
    await renderArticleViewWithHeadings();

    const scrollContainer = await screen.findByTestId('article-scroll-container');
    const scrollTo = vi.fn();
    Object.defineProperty(scrollContainer, 'scrollTo', {
      value: scrollTo,
      configurable: true,
    });

    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 800 });

    const articleContent = await screen.findByTestId('article-html-content');
    Object.defineProperty(articleContent, 'scrollHeight', { configurable: true, value: 1400 });

    const contentShell = await screen.findByTestId('article-content-shell');
    contentShell.getBoundingClientRect = () => ({
      left: 120,
      right: 820,
      top: 0,
      bottom: 0,
      width: 700,
      height: 1200,
      x: 120,
      y: 0,
      toJSON: () => ({}),
    });

    const articleViewport = await screen.findByTestId('article-viewport');
    articleViewport.getBoundingClientRect = () => ({
      left: 0,
      right: 1120,
      top: 0,
      bottom: 900,
      width: 1120,
      height: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeObserver.trigger();
      await Promise.resolve();
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Details' }));

    expect(scrollTo).toHaveBeenCalled();
  });

  it('rebuilds the outline when the rendered body html changes', async () => {
    const { rerender } = await renderArticleViewWithHeadings();

    const scrollContainer = await screen.findByTestId('article-scroll-container');
    Object.defineProperty(scrollContainer, 'clientHeight', { configurable: true, value: 800 });

    const articleContent = await screen.findByTestId('article-html-content');
    Object.defineProperty(articleContent, 'scrollHeight', { configurable: true, value: 1400 });

    const contentShell = await screen.findByTestId('article-content-shell');
    contentShell.getBoundingClientRect = () => ({
      left: 120,
      right: 820,
      top: 0,
      bottom: 0,
      width: 700,
      height: 1200,
      x: 120,
      y: 0,
      toJSON: () => ({}),
    });

    const articleViewport = await screen.findByTestId('article-viewport');
    articleViewport.getBoundingClientRect = () => ({
      left: 0,
      right: 1120,
      top: 0,
      bottom: 900,
      width: 1120,
      height: 900,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    await act(async () => {
      resizeObserver.trigger();
      await Promise.resolve();
    });

    expect(await screen.findByRole('button', { name: 'Overview' })).toBeInTheDocument();

    await act(async () => {
      useAppStore.setState((state) => ({
        ...state,
        articles: state.articles.map((article) =>
          article.id === 'article-1'
            ? { ...article, content: '<h2>Fresh heading</h2><p>Updated</p>' }
            : article,
        ),
      }));

      rerender(<ArticleView />);
      resizeObserver.trigger();
      await Promise.resolve();
    });

    expect(await screen.findByRole('button', { name: 'Fresh heading' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Overview' })).not.toBeInTheDocument();
  });
});
