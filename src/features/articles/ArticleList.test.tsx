import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewType } from '../../types';
import { AI_DIGEST_VIEW_ID } from '../../lib/view';

type ArticleListModule = typeof import('./ArticleList');
type AppStoreModule = typeof import('../../store/appStore');
type ToastHostModule = typeof import('../toast/ToastHost');
type LoadSnapshot = (input?: { view?: ViewType }) => Promise<void>;

const ALL_FEEDS_REFRESH_LABEL = '刷新全部订阅源';
const FEED_REFRESH_LABEL = '刷新订阅源';
const TOGGLE_TO_LIST_LABEL = '切换为列表';
const TOGGLE_UNREAD_ONLY_LABEL = '仅显示未读文章';
const SHOW_ALL_ARTICLES_LABEL = '显示全部文章';
const MARK_ALL_AS_READ_LABEL = '标记全部为已读';
const UNREAD_SIGNAL_DOT_CLASS = 'bg-[color-mix(in_oklab,var(--color-primary)_78%,white)]';
const UNREAD_SIGNAL_TIME_CLASS =
  'text-[color-mix(in_oklab,var(--color-primary)_88%,white_12%)]';

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function setupImagePreloadMock() {
  const originalImage = globalThis.Image;

  class MockImage {
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    src = '';

    triggerLoad() {
      this.onload?.(new Event('load'));
    }

    triggerError() {
      this.onerror?.(new Event('error'));
    }
  }

  const instances: MockImage[] = [];

  class MockImageConstructor extends MockImage {
    constructor() {
      super();
      instances.push(this);
    }
  }

  vi.stubGlobal('Image', MockImageConstructor as unknown as typeof Image);

  return {
    instances,
    restore() {
      vi.stubGlobal('Image', originalImage);
    },
  };
}

function setupIntersectionObserverMock() {
  const original = globalThis.IntersectionObserver;
  const targets = new Map<string, Element>();
  let callback: IntersectionObserverCallback = () => undefined;

  class MockIntersectionObserver {
    constructor(cb: IntersectionObserverCallback) {
      callback = cb;
    }

    observe(target: Element) {
      const articleId = target.getAttribute('data-article-id');
      if (articleId) targets.set(articleId, target);
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);

  return {
    triggerIntersect(articleIds: string[]) {
      callback(
        articleIds
          .map((articleId) => targets.get(articleId))
          .filter((target): target is Element => Boolean(target))
          .map((target) => ({
            target,
            isIntersecting: true,
          }) as IntersectionObserverEntry),
        {} as IntersectionObserver,
      );
    },
    restore() {
      vi.stubGlobal('IntersectionObserver', original);
    },
  };
}

describe('ArticleList', () => {
  let ArticleList: ArticleListModule['default'];
  let useAppStore: AppStoreModule['useAppStore'];
  let ToastHost: ToastHostModule['ToastHost'];
  let fetchMock: ReturnType<typeof vi.fn>;

  function getFetchCallUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input;
    if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
    if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
    return String(input);
  }

  function getFetchCallMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
    return init?.method ?? 'GET';
  }

  async function getFetchCallBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      try {
        return await input.text();
      } catch {
        return undefined;
      }
    }
    return typeof init?.body === 'string' ? init.body : undefined;
  }

  function renderWithNotifications() {
    return render(
      <>
        <ToastHost />
        <ArticleList />
      </>,
    );
  }

  function getScrollContainer(container: HTMLElement) {
    const element = container.querySelector('.overflow-y-auto');
    if (!(element instanceof HTMLDivElement)) {
      throw new Error('Scroll container not found');
    }
    return element;
  }

  function expectLoadMoreFooterCentered(element: HTMLElement) {
    expect(element).toHaveClass('flex');
    expect(element).toHaveClass('justify-center');
    expect(element).toHaveClass('px-4');
    expect(element).toHaveClass('py-3');
  }

  function createSeedArticles(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: `article-${index}`,
      feedId: 'feed-1',
      title: `Article ${index}`,
      content: '',
      summary: `Summary ${index}`,
      previewImage: `https://example.com/${index}.jpg`,
      publishedAt: new Date(Date.UTC(2026, 1, 25, 0, count - index, 0)).toISOString(),
      link: `https://example.com/${index}`,
      isRead: false,
      isStarred: false,
    }));
  }

  beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getFetchCallUrl(input);
      const method = getFetchCallMethod(input, init);

      if (url.includes('/api/feeds/refresh') && method === 'POST') {
        return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
      }
      if (url.includes('/api/feeds/') && url.endsWith('/refresh') && method === 'POST') {
        return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
      }
      if (url.includes('/api/articles/') && method === 'PATCH') {
        return jsonResponse({ ok: true, data: { updated: true } });
      }
      if (url.includes('/api/feeds/') && method === 'PATCH') {
        const bodyText = await getFetchCallBodyText(input, init);
        const body = JSON.parse(bodyText ?? '{}') as {
          articleListDisplayMode?: 'card' | 'list';
        };
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-1',
            title: 'Example Feed',
            url: 'https://example.com/rss.xml',
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            articleListDisplayMode: body.articleListDisplayMode ?? 'card',
            categoryId: null,
            fetchIntervalMinutes: 30,
          },
        });
      }

      return jsonResponse({ ok: true, data: { updated: true } });
    });
    vi.stubGlobal('fetch', fetchMock);

    ({ default: ArticleList } = await import('./ArticleList'));
    ({ ToastHost } = await import('../toast/ToastHost'));
    ({ useAppStore } = await import('../../store/appStore'));

    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
      ],
      articles: [
        {
          id: 'art-1',
          feedId: 'feed-1',
          title: 'Selected Article',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-25T00:00:00.000Z').toISOString(),
          link: 'https://example.com/1',
          isRead: false,
          isStarred: false,
        },
        {
          id: 'art-2',
          feedId: 'feed-1',
          title: 'Other Article',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          link: 'https://example.com/2',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'art-1',
      showUnreadOnly: true,
    });
  });

  it('keeps selected article visible after it is marked as read when showUnreadOnly is enabled', () => {
    renderWithNotifications();
    expect(screen.getByText('Selected Article')).toBeInTheDocument();

    act(() => {
      useAppStore.getState().markAsRead('art-1');
    });

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
  });

  it('uses titleZh when available and falls back to title', () => {
    useAppStore.setState({
      articles: [
        {
          id: 'art-zh',
          feedId: 'feed-1',
          title: 'Original title',
          titleOriginal: 'Original title',
          titleZh: '译文标题',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-25T00:00:00.000Z').toISOString(),
          link: 'https://example.com/zh',
          isRead: false,
          isStarred: false,
        },
        {
          id: 'art-fallback',
          feedId: 'feed-1',
          title: 'Only original title',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          link: 'https://example.com/fallback',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedArticleId: 'art-zh',
    });

    renderWithNotifications();

    expect(screen.getByText('译文标题')).toBeInTheDocument();
    expect(screen.getByText('Only original title')).toBeInTheDocument();
    expect(screen.queryByText('Original title')).not.toBeInTheDocument();
  });

  it('keeps selected read article visible when showUnreadOnly is enabled (fresh session)', () => {
    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1' ? { ...article, isRead: true } : article,
      ),
    }));

    renderWithNotifications();

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).toBeInTheDocument();
  });

  it('retains all currently visible articles in unread view after marking them read', () => {
    useAppStore.setState({
      selectedView: 'unread',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
    });

    renderWithNotifications();

    act(() => {
      useAppStore.getState().markAsRead('art-1');
      useAppStore.getState().markAsRead('art-2');
    });

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.getByText('Other Article')).toBeInTheDocument();
  });

  it('retains a non-selected article that was already visible in unread-only mode', () => {
    useAppStore.setState({
      selectedView: 'all',
      showUnreadOnly: true,
      selectedArticleId: 'art-1',
    });

    renderWithNotifications();

    act(() => {
      useAppStore.getState().markAsRead('art-2');
    });

    expect(screen.getByText('Other Article')).toBeInTheDocument();
  });

  it('drops retained read items after selectedView changes', () => {
    useAppStore.setState({ selectedView: 'all', showUnreadOnly: true });
    renderWithNotifications();

    act(() => {
      useAppStore.getState().markAsRead('art-1');
      useAppStore.getState().markAsRead('art-2');
    });
    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.getByText('Other Article')).toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'unread', showUnreadOnly: false });
    });

    act(() => {
      useAppStore.setState({ selectedView: 'all', showUnreadOnly: true });
    });

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).not.toBeInTheDocument();
  });

  it('drops retained read items after unread-only toggle off and on', () => {
    useAppStore.setState({ selectedView: 'all', showUnreadOnly: true });
    renderWithNotifications();

    act(() => {
      useAppStore.getState().markAsRead('art-1');
      useAppStore.getState().markAsRead('art-2');
      useAppStore.setState({ showUnreadOnly: false });
      useAppStore.setState({ showUnreadOnly: true });
    });

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).not.toBeInTheDocument();
  });

  it('drops retained read items when snapshot loading completes', () => {
    useAppStore.setState({ selectedView: 'all', showUnreadOnly: true });
    renderWithNotifications();

    act(() => {
      useAppStore.getState().markAsRead('art-1');
      useAppStore.getState().markAsRead('art-2');
      useAppStore.setState({ snapshotLoading: true });
      useAppStore.setState({ snapshotLoading: false });
    });

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).not.toBeInTheDocument();
  });

  it('shows 0 unread count and keeps only selected article after mark-all-as-read in unread-only mode', () => {
    useAppStore.setState({
      selectedView: 'all',
      showUnreadOnly: true,
      selectedArticleId: 'art-1',
    });

    renderWithNotifications();

    expect(screen.getByText('2 篇')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: MARK_ALL_AS_READ_LABEL }));

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).not.toBeInTheDocument();
    expect(screen.getByText('0 篇')).toBeInTheDocument();
  });

  it('supports arrow-key navigation across article items', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
    });

    renderWithNotifications();

    const firstButton = screen.getByTestId('article-card-art-1-title').closest('button');
    const secondButton = screen.getByTestId('article-card-art-2-title').closest('button');

    expect(firstButton).not.toBeNull();
    expect(secondButton).not.toBeNull();

    firstButton?.focus();
    fireEvent.keyDown(firstButton as HTMLButtonElement, { key: 'ArrowDown' });

    expect(secondButton).toHaveFocus();
    expect(useAppStore.getState().selectedArticleId).toBe('art-2');

    fireEvent.keyDown(secondButton as HTMLButtonElement, { key: 'Home' });

    expect(firstButton).toHaveFocus();
    expect(useAppStore.getState().selectedArticleId).toBe('art-1');
  });

  it('loads next page when scrolling near the bottom', async () => {
    const loadMoreSnapshotMock = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
      articleListHasMore: true,
      articleListLoadingMore: false,
      articleListLoadMoreError: false,
      articleListNextCursor: 'cursor-1',
      loadMoreSnapshot: loadMoreSnapshotMock,
    });

    const { container } = renderWithNotifications();
    const scrollContainer = getScrollContainer(container);

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 400,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      configurable: true,
      value: 1200,
    });

    fireEvent.scroll(scrollContainer, { target: { scrollTop: 900 } });

    await waitFor(() => {
      expect(loadMoreSnapshotMock).toHaveBeenCalledTimes(1);
    });
  });

  it('renders only the visible virtual card rows instead of the full article set', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'article-0',
      articles: createSeedArticles(120),
    });

    const { container } = renderWithNotifications();
    const scrollContainer = getScrollContainer(container);

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 520,
    });

    expect(screen.getByTestId('article-card-article-0-title')).toBeInTheDocument();
    expect(screen.queryByTestId('article-card-article-119-title')).not.toBeInTheDocument();
  });

  it('renders only the visible virtual list rows in list mode', async () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'article-0',
      articles: createSeedArticles(120),
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 120,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'list',
          categoryId: null,
        },
      ],
    });

    const { container } = renderWithNotifications();
    const scrollContainer = getScrollContainer(container);

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 520,
    });

    expect(await screen.findByTestId('article-list-row-article-0-title')).toBeInTheDocument();
    expect(screen.queryByTestId('article-list-row-article-119-title')).not.toBeInTheDocument();
  });

  it('shows a retry action when loading more fails without clearing existing articles', () => {
    const loadMoreSnapshotMock = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
      articleListHasMore: true,
      articleListLoadingMore: false,
      articleListLoadMoreError: true,
      articleListNextCursor: 'cursor-1',
      loadMoreSnapshot: loadMoreSnapshotMock,
    });

    renderWithNotifications();

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '加载更多时出了点小问题，再试一次' });
    expectLoadMoreFooterCentered(retryButton.parentElement as HTMLElement);
    fireEvent.click(retryButton);
    expect(loadMoreSnapshotMock).toHaveBeenCalledTimes(1);
  });

  it('shows a centered gentle loading hint while loading more', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
      articleListHasMore: true,
      articleListLoadingMore: true,
      articleListLoadMoreError: false,
      articleListNextCursor: 'cursor-1',
    });

    renderWithNotifications();

    const hint = screen.getByText('正在为你加载更多内容...');
    expectLoadMoreFooterCentered(hint.parentElement as HTMLElement);
  });

  it('shows a centered end hint after the last page is reached', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
      articleListHasMore: false,
      articleListLoadingMore: false,
      articleListLoadMoreError: false,
      articleListNextCursor: null,
    });

    renderWithNotifications();

    const hint = screen.getByText('已经到底了，暂时没有更多内容');
    expectLoadMoreFooterCentered(hint.parentElement as HTMLElement);
  });

  it('keeps viewport stable when refreshed data prepends newer articles', async () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'article-30',
      articles: createSeedArticles(80),
    });

    const { container } = renderWithNotifications();
    const scrollContainer = getScrollContainer(container);

    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 520,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      configurable: true,
      value: 4000,
    });

    scrollContainer.scrollTop = 1600;
    fireEvent.scroll(scrollContainer, { target: { scrollTop: 1600 } });

    act(() => {
      useAppStore.setState((state) => ({
        ...state,
        articles: [
          {
            id: 'article-new-1',
            feedId: 'feed-1',
            title: 'Newest Article 1',
            content: '',
            summary: 'Summary',
            publishedAt: new Date('2026-03-01T00:00:00.000Z').toISOString(),
            link: 'https://example.com/new-1',
            isRead: false,
            isStarred: false,
          },
          {
            id: 'article-new-2',
            feedId: 'feed-1',
            title: 'Newest Article 2',
            content: '',
            summary: 'Summary',
            publishedAt: new Date('2026-02-28T23:59:00.000Z').toISOString(),
            link: 'https://example.com/new-2',
            isRead: false,
            isStarred: false,
          },
          ...state.articles,
        ],
      }));
    });

    await waitFor(() => {
      expect(scrollContainer.scrollTop).toBeGreaterThan(1600);
    });
  });

  it('does not preload distant preview images before observer activation', () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState({
      articles: Array.from({ length: 6 }, (_, index) => ({
        id: `art-${index + 1}`,
        feedId: 'feed-1',
        title: `Article ${index + 1}`,
        content: '',
        previewImage: `https://example.com/${index + 1}.jpg`,
        summary: 'Summary',
        publishedAt: new Date(`2026-02-${25 - index}T00:00:00.000Z`).toISOString(),
        link: `https://example.com/${index + 1}`,
        isRead: false,
        isStarred: false,
      })),
      selectedArticleId: 'art-1',
    });

    try {
      renderWithNotifications();

      expect(preload.instances).toHaveLength(0);

      act(() => {
        observer.triggerIntersect(['art-1', 'art-2']);
      });

      expect(preload.instances).toHaveLength(2);
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('limits preview image preloads to two concurrent requests', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState({
      articles: Array.from({ length: 5 }, (_, index) => ({
        id: `art-${index + 1}`,
        feedId: 'feed-1',
        title: `Article ${index + 1}`,
        content: '',
        previewImage: `https://example.com/${index + 1}.jpg`,
        summary: 'Summary',
        publishedAt: new Date(`2026-02-${25 - index}T00:00:00.000Z`).toISOString(),
        link: `https://example.com/${index + 1}`,
        isRead: false,
        isStarred: false,
      })),
      selectedArticleId: 'art-1',
    });

    try {
      renderWithNotifications();

      act(() => {
        observer.triggerIntersect(['art-1', 'art-2', 'art-3', 'art-4']);
      });

      expect(preload.instances).toHaveLength(2);

      act(() => {
        preload.instances[0].triggerLoad();
      });

      await waitFor(() => {
        expect(preload.instances).toHaveLength(3);
      });
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('does not retry failed preview images after reactivation', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1'
          ? { ...article, previewImage: 'https://example.com/broken.jpg' }
          : article,
      ),
    }));

    try {
      renderWithNotifications();

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      await waitFor(() => {
        expect(preload.instances).toHaveLength(1);
      });

      act(() => {
        preload.instances[0].triggerError();
        observer.triggerIntersect(['art-1']);
      });

      expect(preload.instances).toHaveLength(1);
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('drops stale preview image statuses after article list changes', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1'
          ? { ...article, previewImage: 'https://example.com/1.jpg' }
          : article,
      ),
    }));

    try {
      renderWithNotifications();

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      await waitFor(() => {
        expect(preload.instances).toHaveLength(1);
      });

      act(() => {
        preload.instances[0].triggerLoad();
      });

      await waitFor(() => {
        expect(screen.getByTestId('article-card-art-1-title')).toBeInTheDocument();
      });

      act(() => {
        useAppStore.setState({
          selectedView: 'starred',
          articles: [],
          selectedArticleId: null,
        });
      });

      expect(preload.instances).toHaveLength(1);
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('drops stale preview image in-flight slots after article list changes', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState({
      articles: Array.from({ length: 4 }, (_, index) => ({
        id: `art-${index + 1}`,
        feedId: 'feed-1',
        title: `Article ${index + 1}`,
        content: '',
        previewImage: `https://example.com/${index + 1}.jpg`,
        summary: 'Summary',
        publishedAt: new Date(`2026-02-${25 - index}T00:00:00.000Z`).toISOString(),
        link: `https://example.com/${index + 1}`,
        isRead: false,
        isStarred: false,
      })),
      selectedArticleId: 'art-1',
      selectedView: 'all',
    });

    try {
      renderWithNotifications();

      act(() => {
        observer.triggerIntersect(['art-1', 'art-2', 'art-3', 'art-4']);
      });

      expect(preload.instances).toHaveLength(2);

      act(() => {
        useAppStore.setState({
          selectedView: 'starred',
          articles: [],
          selectedArticleId: null,
        });
      });

      act(() => {
        useAppStore.setState({
          selectedView: 'all',
          articles: [
            {
              id: 'art-9',
              feedId: 'feed-1',
              title: 'Article 9',
              content: '',
              previewImage: 'https://example.com/9.jpg',
              summary: 'Summary',
              publishedAt: new Date('2026-02-20T00:00:00.000Z').toISOString(),
              link: 'https://example.com/9',
              isRead: false,
              isStarred: false,
            },
          ],
          selectedArticleId: 'art-9',
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('article-card-art-9-title')).toBeInTheDocument();
      });

      act(() => {
        observer.triggerIntersect(['art-9']);
      });

      expect(preload.instances).toHaveLength(3);
      expect(preload.instances[2].src).toBe('https://example.com/9.jpg');
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('renders preview image only after preload succeeds', async () => {
    const previewImageUrl = 'https://example.com/preview.jpg';
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1' ? { ...article, previewImage: previewImageUrl } : article,
      ),
    }));

    try {
      const { container } = renderWithNotifications();

      expect(preload.instances).toHaveLength(0);

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      expect(preload.instances).toHaveLength(1);
      expect(preload.instances[0].src).toBe(previewImageUrl);
      expect(container.querySelector(`img[src="${previewImageUrl}"]`)).not.toBeInTheDocument();

      act(() => {
        preload.instances[0].triggerLoad();
      });

      await waitFor(() => {
        expect(container.querySelector(`img[src="${previewImageUrl}"]`)).toBeInTheDocument();
      });
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it('keeps preview image hidden when preload fails', () => {
    const brokenImageUrl = 'https://example.com/broken-preview.jpg';
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1' ? { ...article, previewImage: brokenImageUrl } : article,
      ),
    }));

    try {
      const { container } = renderWithNotifications();

      expect(preload.instances).toHaveLength(0);

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      expect(preload.instances).toHaveLength(1);
      expect(container.querySelector(`img[src="${brokenImageUrl}"]`)).not.toBeInTheDocument();

      act(() => {
        preload.instances[0].triggerError();
      });

      expect(container.querySelector(`img[src="${brokenImageUrl}"]`)).not.toBeInTheDocument();
    } finally {
      preload.restore();
      observer.restore();
    }
  });

  it.each(['all', 'unread', 'starred'] as const)(
    'refreshes all enabled feeds in %s view',
    async (view) => {
      vi.useFakeTimers();
      try {
        let runStatusCalls = 0;
        const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = getFetchCallUrl(input);
          const method = getFetchCallMethod(input, init);

          if (url.includes('/api/feeds/refresh') && method === 'POST') {
            return jsonResponse({
              ok: true,
              data: { enqueued: true, jobId: 'job-1', runId: 'run-refresh-all' },
            });
          }

          if (url.includes('/api/feed-refresh-runs/run-refresh-all') && method === 'GET') {
            runStatusCalls += 1;
            return jsonResponse({
              ok: true,
              data: {
                id: 'run-refresh-all',
                scope: 'all',
                status: runStatusCalls > 1 ? 'succeeded' : 'running',
                feedId: null,
                totalCount: 2,
                succeededCount: runStatusCalls > 1 ? 2 : 0,
                failedCount: 0,
                errorMessage: null,
                updatedAt: '2026-03-25T00:00:00.000Z',
                finishedAt: runStatusCalls > 1 ? '2026-03-25T00:00:01.000Z' : null,
              },
            });
          }

          return jsonResponse({ ok: true, data: { updated: true } });
        });
        useAppStore.setState({
          selectedView: view,
          selectedArticleId: null,
          loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
        });

        renderWithNotifications();

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: ALL_FEEDS_REFRESH_LABEL }));
          await vi.runAllTimersAsync();
        });

        const refreshCall = fetchMock.mock.calls.find(([input]) =>
          getFetchCallUrl(input).includes('/api/feeds/refresh'),
        );
        expect(refreshCall).toBeTruthy();
        expect(getFetchCallMethod(refreshCall?.[0] as RequestInfo | URL, refreshCall?.[1])).toBe('POST');
        expect(loadSnapshotMock).toHaveBeenCalledWith({ view });
        expect(runStatusCalls).toBeGreaterThan(1);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('refreshes selected feed in feed view', async () => {
    vi.useFakeTimers();
    try {
      let runStatusCalls = 0;
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/feed-1/refresh') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: true, jobId: 'job-1', runId: 'run-refresh-feed-1' },
          });
        }

        if (url.includes('/api/feed-refresh-runs/run-refresh-feed-1') && method === 'GET') {
          runStatusCalls += 1;
          return jsonResponse({
            ok: true,
            data: {
              id: 'run-refresh-feed-1',
              scope: 'single',
              status: runStatusCalls > 1 ? 'succeeded' : 'running',
              feedId: 'feed-1',
              totalCount: 1,
              succeededCount: runStatusCalls > 1 ? 1 : 0,
              failedCount: 0,
              errorMessage: null,
              updatedAt: '2026-03-25T00:00:00.000Z',
              finishedAt: runStatusCalls > 1 ? '2026-03-25T00:00:01.000Z' : null,
            },
          });
        }

        return jsonResponse({ ok: true, data: { updated: true } });
      });
      useAppStore.setState({
        selectedView: 'feed-1',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: FEED_REFRESH_LABEL }));
        await vi.runAllTimersAsync();
      });

      const refreshCall = fetchMock.mock.calls.find(([input]) =>
        getFetchCallUrl(input).includes('/api/feeds/feed-1/refresh'),
      );
      expect(refreshCall).toBeTruthy();
      expect(getFetchCallMethod(refreshCall?.[0] as RequestInfo | URL, refreshCall?.[1])).toBe('POST');
      expect(loadSnapshotMock).toHaveBeenCalledWith({ view: 'feed-1' });
      expect(runStatusCalls).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows 立即生成 in ai_digest feed view', () => {
    useAppStore.setState((state) => ({
      ...state,
      feeds: [
        {
          ...state.feeds[0],
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'My Digest',
          url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
        },
      ],
      selectedView: 'digest-1',
      selectedArticleId: null,
    }));

    renderWithNotifications();

    expect(screen.getByRole('button', { name: '立即生成' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: FEED_REFRESH_LABEL })).not.toBeInTheDocument();
  });

  it('shows started info then terminal success for digest generation', async () => {
    vi.useFakeTimers();
    let runStatusCalls = 0;
    const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);

    try {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/ai-digests/digest-1/generate') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: true, jobId: 'job-1', runId: 'run-1' },
          });
        }

        if (url.includes('/api/ai-digests/runs/run-1') && method === 'GET') {
          runStatusCalls += 1;
          return jsonResponse({
            ok: true,
            data: {
              id: 'run-1',
              status: runStatusCalls > 1 ? 'succeeded' : 'running',
              errorCode: null,
              errorMessage: null,
              updatedAt: '2026-03-25T00:00:00.000Z',
            },
          });
        }

        return jsonResponse({ ok: true, data: { updated: true } });
      });

      useAppStore.setState((state) => ({
        ...state,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
        feeds: [
          {
            ...state.feeds[0],
            id: 'digest-1',
            kind: 'ai_digest',
            title: 'My Digest',
            url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
          },
        ],
        selectedView: 'digest-1',
        selectedArticleId: null,
      }));

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '立即生成' }));
        await Promise.resolve();
      });

      expect(screen.getByText('已开始生成 AI 解读')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
        await Promise.resolve();
      });

      expect(screen.getByText('AI 解读已生成')).toBeInTheDocument();
      expect(screen.queryByText('已在生成中')).not.toBeInTheDocument();
      expect(runStatusCalls).toBeGreaterThan(1);
      expect(loadSnapshotMock).toHaveBeenCalledWith({ view: 'digest-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows started info then aggregated terminal error for refresh all', async () => {
    vi.useFakeTimers();
    let runStatusCalls = 0;
    const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);

    try {
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/refresh') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: true, jobId: 'job-1', runId: 'run-refresh-1' },
          });
        }

        if (url.includes('/api/feed-refresh-runs/run-refresh-1') && method === 'GET') {
          runStatusCalls += 1;
          return jsonResponse({
            ok: true,
            data: {
              id: 'run-refresh-1',
              scope: 'all',
              status: runStatusCalls > 1 ? 'failed' : 'running',
              feedId: null,
              totalCount: 3,
              succeededCount: 1,
              failedCount: 2,
              errorMessage: '2 个订阅源刷新失败',
              updatedAt: '2026-03-25T00:00:00.000Z',
              finishedAt: runStatusCalls > 1 ? '2026-03-25T00:00:02.000Z' : null,
            },
          });
        }

        return jsonResponse({ ok: true, data: { updated: true } });
      });

      useAppStore.setState({
        selectedView: 'all',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: '刷新全部订阅源' }));
        await Promise.resolve();
      });

      expect(screen.getByText('已开始刷新全部订阅源')).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
        await Promise.resolve();
      });

      expect(screen.getByText('刷新全部订阅源失败：2 个订阅源刷新失败')).toBeInTheDocument();
      expect(runStatusCalls).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows success notification when refreshing all feeds starts', async () => {
    vi.useFakeTimers();
    try {
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/refresh') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: true, jobId: 'job-1', runId: 'run-refresh-all' },
          });
        }

        if (url.includes('/api/feed-refresh-runs/run-refresh-all') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              id: 'run-refresh-all',
              scope: 'all',
              status: 'running',
              feedId: null,
              totalCount: 2,
              succeededCount: 0,
              failedCount: 0,
              errorMessage: null,
              updatedAt: '2026-03-25T00:00:00.000Z',
              finishedAt: null,
            },
          });
        }

        return jsonResponse({ ok: true, data: { updated: true } });
      });
      useAppStore.setState({
        selectedView: 'all',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: ALL_FEEDS_REFRESH_LABEL }));
        await Promise.resolve();
      });

      expect(screen.getByText('已开始刷新全部订阅源')).toBeInTheDocument();

      await act(async () => {
        await vi.runOnlyPendingTimersAsync();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows unified notifier error when refresh enqueue fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: false,
        error: {
          code: 'fetch_timeout',
          message: '刷新失败：请求超时',
        },
      }),
    );

    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    fireEvent.click(screen.getByRole('button', { name: ALL_FEEDS_REFRESH_LABEL }));

    await waitFor(() => {
      expect(screen.getByText('刷新全部订阅源失败：刷新失败：请求超时')).toBeInTheDocument();
    });
  });

  it('shows success notification when refreshing all feeds completes', async () => {
    vi.useFakeTimers();
    try {
      let runStatusCalls = 0;
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/feeds/refresh') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: true, jobId: 'job-1', runId: 'run-refresh-all' },
          });
        }

        if (url.includes('/api/feed-refresh-runs/run-refresh-all') && method === 'GET') {
          runStatusCalls += 1;
          return jsonResponse({
            ok: true,
            data: {
              id: 'run-refresh-all',
              scope: 'all',
              status: runStatusCalls > 1 ? 'succeeded' : 'running',
              feedId: null,
              totalCount: 2,
              succeededCount: runStatusCalls > 1 ? 2 : 0,
              failedCount: 0,
              errorMessage: null,
              updatedAt: '2026-03-25T00:00:00.000Z',
              finishedAt: runStatusCalls > 1 ? '2026-03-25T00:00:01.000Z' : null,
            },
          });
        }

        return jsonResponse({ ok: true, data: { updated: true } });
      });
      useAppStore.setState({
        selectedView: 'all',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: ALL_FEEDS_REFRESH_LABEL }));
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });

      expect(screen.getByText('全部订阅源已刷新')).toBeInTheDocument();
      expect(loadSnapshotMock).toHaveBeenCalledWith({ view: 'all' });
      expect(runStatusCalls).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables refresh button when selected feed is disabled', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      feeds: [
        {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: false,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
      ],
    });

    renderWithNotifications();

    expect(screen.getByRole('button', { name: FEED_REFRESH_LABEL })).toBeDisabled();
  });

  it('shows selected feed title in header when viewing a specific feed', () => {
    useAppStore.setState({ selectedView: 'feed-1' });

    renderWithNotifications();

    expect(screen.getByRole('heading', { level: 2, name: 'Example Feed' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: '文章' })).not.toBeInTheDocument();
  });

  it('uses reader toolbar tooltips for middle-pane icon actions', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });

    renderWithNotifications();

    const refreshButton = screen.getByRole('button', { name: FEED_REFRESH_LABEL });
    const displayModeButton = screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL });

    expect(refreshButton).not.toHaveAttribute('title');
    expect(displayModeButton).not.toHaveAttribute('title');

    fireEvent.focus(refreshButton);
    expect(await screen.findByRole('tooltip', { name: FEED_REFRESH_LABEL })).toBeInTheDocument();

    fireEvent.focus(displayModeButton);
    expect(await screen.findByRole('tooltip', { name: TOGGLE_TO_LIST_LABEL })).toBeInTheDocument();
  });

  it('truncates long selected feed titles in header while preserving full title tooltip', () => {
    const longTitle = '这是一个非常非常长的订阅源标题🙂 مع نص عربي طويل للغاية for overflow hardening';

    useAppStore.setState({
      selectedView: 'feed-1',
      feeds: [
        {
          id: 'feed-1',
          title: longTitle,
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
      ],
    });

    renderWithNotifications();

    const heading = screen.getByRole('heading', { level: 2, name: longTitle });
    expect(heading).toHaveClass('min-w-0');
    expect(heading).toHaveClass('truncate');
    expect(heading).toHaveAttribute('title', longTitle);
  });

  it('renders empty state when the middle column has no articles', () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      articles: [],
      selectedArticleId: null,
    });

    renderWithNotifications();

    const emptyHint = screen.getByText('这个订阅源还没有文章');

    expect(emptyHint).toBeInTheDocument();
    expect(emptyHint).toHaveClass('text-muted-foreground');
    expect(screen.queryByText('刷新订阅源后，新文章会出现在这里。')).not.toBeInTheDocument();
    expect(screen.queryByTestId('article-list-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('0 篇')).toBeInTheDocument();
  });

  it('shows only AI digest articles and supports unread toggle in 智能解读 smart view', () => {
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          kind: 'rss',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
        {
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'Digest Feed',
          url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
          unreadCount: 0,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
      ],
      articles: [
        {
          id: 'rss-1',
          feedId: 'feed-1',
          title: 'RSS Article',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-25T00:00:00.000Z').toISOString(),
          link: 'https://example.com/rss',
          isRead: false,
          isStarred: false,
        },
        {
          id: 'digest-article-1',
          feedId: 'digest-1',
          title: 'Digest Article A',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          link: 'https://example.com/digest-a',
          isRead: false,
          isStarred: false,
        },
        {
          id: 'digest-article-2',
          feedId: 'digest-1',
          title: 'Digest Article Read',
          content: '',
          summary: 'Summary',
          publishedAt: new Date('2026-02-23T00:00:00.000Z').toISOString(),
          link: 'https://example.com/digest-b',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: AI_DIGEST_VIEW_ID,
      selectedArticleId: 'digest-article-1',
      showUnreadOnly: false,
    });

    renderWithNotifications();

    expect(screen.getByRole('heading', { level: 2, name: '智能解读' })).toBeInTheDocument();
    expect(screen.getByText('Digest Article A')).toBeInTheDocument();
    expect(screen.getByText('Digest Article Read')).toBeInTheDocument();
    expect(screen.queryByText('RSS Article')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: TOGGLE_UNREAD_ONLY_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MARK_ALL_AS_READ_LABEL })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: TOGGLE_UNREAD_ONLY_LABEL }));

    expect(screen.getByRole('button', { name: SHOW_ALL_ARTICLES_LABEL })).toBeInTheDocument();
    expect(screen.queryByText('Digest Article Read')).not.toBeInTheDocument();
  });

  it('shows brief content under the title for AI digest cards when summary is empty', () => {
    useAppStore.setState({
      feeds: [
        {
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'Digest Feed',
          url: 'http://localhost/__feedfuse_ai_digest__/digest-1',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
        },
      ],
      articles: [
        {
          id: 'digest-article-brief',
          feedId: 'digest-1',
          title: 'Digest Article With Brief',
          content: '<p>这是一段 AI 解读的简要内容。</p><p>第二段。</p>',
          summary: '',
          publishedAt: new Date('2026-02-24T00:00:00.000Z').toISOString(),
          link: 'https://example.com/digest-brief',
          isRead: false,
          isStarred: false,
        },
      ],
      selectedView: AI_DIGEST_VIEW_ID,
      selectedArticleId: 'digest-article-brief',
      showUnreadOnly: false,
    });

    renderWithNotifications();

    expect(screen.getByTestId('article-card-digest-article-brief-summary')).toHaveTextContent(
      '这是一段 AI 解读的简要内容。 第二段。',
    );
  });

  it('shows display mode toggle only in feed view and hides it in all/unread/starred/ai-digest views', () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    expect(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL })).toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'all' });
    });
    expect(screen.queryByRole('button', { name: TOGGLE_TO_LIST_LABEL })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'unread' });
    });
    expect(screen.queryByRole('button', { name: TOGGLE_TO_LIST_LABEL })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'starred' });
    });
    expect(screen.queryByRole('button', { name: TOGGLE_TO_LIST_LABEL })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: AI_DIGEST_VIEW_ID });
    });
    expect(screen.queryByRole('button', { name: TOGGLE_TO_LIST_LABEL })).not.toBeInTheDocument();
  });

  it('renders refresh icon before display mode toggle icon in feed view', () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    const refreshButton = screen.getByRole('button', { name: FEED_REFRESH_LABEL });
    const toggleDisplayModeButton = screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL });
    const relation = refreshButton.compareDocumentPosition(toggleDisplayModeButton);

    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders list row with single-line title and feed metadata after switching to list mode', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    const title = await screen.findByTestId('article-list-row-art-1-title');

    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('truncate');
    expect(screen.getByTestId('article-list-row-art-1-feed')).toHaveTextContent('Example Feed');
    expect(screen.getByTestId('article-list-row-art-1-time')).toBeInTheDocument();
    expect(screen.getByTestId('article-list-row-art-1-unread-dot')).toBeInTheDocument();
  });

  it('shows duplicate filter reason in card and list modes while keeping the article clickable', async () => {
    useAppStore.setState((state) => ({
      ...state,
      selectedView: 'feed-1',
      selectedArticleId: 'art-1',
      articles: state.articles.map((article) =>
        article.id === 'art-2'
          ? {
              ...article,
              filterStatus: 'filtered',
              isFiltered: true,
              filteredBy: ['duplicate'],
            }
          : article,
      ),
    }));

    renderWithNotifications();

    const filteredCardButton = screen.getByTestId('article-card-art-2-title').closest('button');
    expect(filteredCardButton).not.toBeNull();
    expect(
      within(filteredCardButton as HTMLButtonElement).getByText('已过滤 · 重复/相似转载'),
    ).toBeInTheDocument();

    fireEvent.click(filteredCardButton as HTMLButtonElement);

    await waitFor(() => {
      expect(useAppStore.getState().selectedArticleId).toBe('art-2');
    });

    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    const filteredRowButton = (await screen.findByTestId('article-list-row-art-2-title')).closest('button');
    expect(filteredRowButton).not.toBeNull();
    expect(
      within(filteredRowButton as HTMLButtonElement).getByText('已过滤 · 重复/相似转载'),
    ).toBeInTheDocument();
  });

  it('keeps backend-provided filtered articles visible in aggregate views', () => {
    useAppStore.setState((state) => ({
      ...state,
      selectedView: 'all',
      articles: state.articles.map((article) =>
        article.id === 'art-2'
          ? {
              ...article,
              filterStatus: 'filtered',
              isFiltered: true,
            }
          : article,
      ),
    }));

    renderWithNotifications();

    expect(screen.getByText('Other Article')).toBeInTheDocument();
    expect(screen.getByText('已过滤')).toBeInTheDocument();
  });

  it('renders brighter unread signals consistently in card and list modes', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    const cardDot = screen.getByTestId('article-card-art-1-unread-dot');
    const cardTime = screen.getByTestId('article-card-art-1-time');

    expect(cardDot.className).toContain('h-2');
    expect(cardDot.className).toContain('w-2');
    expect(cardDot.className).toContain(UNREAD_SIGNAL_DOT_CLASS);
    expect(cardDot.className).toContain('ring-2');
    expect(cardTime.className).toContain('font-semibold');
    expect(cardTime.className).toContain(UNREAD_SIGNAL_TIME_CLASS);

    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    const rowDot = await screen.findByTestId('article-list-row-art-1-unread-dot');
    const rowTime = screen.getByTestId('article-list-row-art-1-time');

    expect(rowDot.className).toContain('h-2');
    expect(rowDot.className).toContain('w-2');
    expect(rowDot.className).toContain(UNREAD_SIGNAL_DOT_CLASS);
    expect(rowDot.className).toContain('ring-2');
    expect(rowTime.className).toContain('font-semibold');
    expect(rowTime.className).toContain(UNREAD_SIGNAL_TIME_CLASS);
  });

  it('uses the stronger reader pane hover class for article cards and list rows', async () => {
    useAppStore.setState({ selectedView: 'feed-1', selectedArticleId: 'art-1' });
    renderWithNotifications();

    const cardButton = screen.getByTestId('article-card-art-2-title').closest('button');

    expect(cardButton).not.toBeNull();
    expect(cardButton?.className).toContain('hover:bg-[var(--reader-pane-hover)]');

    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    const listRowButton = (await screen.findByTestId('article-list-row-art-2-title')).closest('button');

    expect(listRowButton).not.toBeNull();
    expect(listRowButton?.className).toContain('hover:bg-[var(--reader-pane-hover)]');
  });

  it('uses one summary line when card title wraps and two lines when title stays on one line', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    const titleArt1 = await screen.findByTestId('article-card-art-1-title');
    const titleArt2 = screen.getByTestId('article-card-art-2-title');
    const summaryArt1 = screen.getByTestId('article-card-art-1-summary');
    const summaryArt2 = screen.getByTestId('article-card-art-2-summary');

    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          lineHeight: '20px',
        }) as CSSStyleDeclaration,
    );

    Object.defineProperty(titleArt1, 'clientHeight', { configurable: true, value: 40 });
    Object.defineProperty(titleArt2, 'clientHeight', { configurable: true, value: 20 });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    await waitFor(() => {
      expect(summaryArt1).toHaveClass('line-clamp-1');
      expect(summaryArt1).not.toHaveClass('line-clamp-2');
      expect(summaryArt2).toHaveClass('line-clamp-2');
      expect(summaryArt2).not.toHaveClass('line-clamp-1');
    });

    getComputedStyleSpy.mockRestore();
  });

  it('recomputes summary clamp after preview image narrows the card text column', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState((state) => ({
      ...state,
      selectedView: 'feed-1',
      articles: state.articles.map((article) =>
        article.id === 'art-1'
          ? { ...article, previewImage: 'https://example.com/preview.jpg' }
          : article,
      ),
    }));

    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          lineHeight: '20px',
        }) as CSSStyleDeclaration,
    );

    try {
      renderWithNotifications();

      const titleArt1 = await screen.findByTestId('article-card-art-1-title');
      const summaryArt1 = screen.getByTestId('article-card-art-1-summary');

      Object.defineProperty(titleArt1, 'clientHeight', { configurable: true, value: 20 });

      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      await waitFor(() => {
        expect(summaryArt1).toHaveClass('line-clamp-2');
        expect(summaryArt1).not.toHaveClass('line-clamp-1');
      });

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      await waitFor(() => {
        expect(preload.instances).toHaveLength(1);
      });

      Object.defineProperty(titleArt1, 'clientHeight', { configurable: true, value: 40 });

      act(() => {
        preload.instances[0].triggerLoad();
      });

      await waitFor(() => {
        expect(summaryArt1).toHaveClass('line-clamp-1');
        expect(summaryArt1).not.toHaveClass('line-clamp-2');
      });
    } finally {
      getComputedStyleSpy.mockRestore();
      preload.restore();
      observer.restore();
    }
  });

  it('preserves wrapped-title summary clamp after virtualized cards unmount during pagination', async () => {
    const preload = setupImagePreloadMock();
    const observer = setupIntersectionObserverMock();

    useAppStore.setState({
      selectedView: 'feed-1',
      showUnreadOnly: false,
      selectedArticleId: 'art-1',
      articles: [
        {
          id: 'art-1',
          feedId: 'feed-1',
          title:
            'A long preview image title that should keep the summary on a single line after remount',
          content: '',
          previewImage: 'https://example.com/preview-art-1.jpg',
          summary: 'Summary',
          publishedAt: new Date('2026-02-26T00:00:00.000Z').toISOString(),
          link: 'https://example.com/art-1',
          isRead: false,
          isStarred: false,
        },
        ...createSeedArticles(80),
      ],
    });

    const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () =>
        ({
          lineHeight: '20px',
        }) as CSSStyleDeclaration,
    );

    try {
      const { container } = renderWithNotifications();
      const scrollContainer = getScrollContainer(container);

      Object.defineProperty(scrollContainer, 'clientHeight', {
        configurable: true,
        value: 520,
      });
      Object.defineProperty(scrollContainer, 'scrollHeight', {
        configurable: true,
        value: 12000,
      });

      const titleArt1 = await screen.findByTestId('article-card-art-1-title');
      const summaryArt1 = screen.getByTestId('article-card-art-1-summary');

      Object.defineProperty(titleArt1, 'clientHeight', { configurable: true, value: 40 });

      act(() => {
        observer.triggerIntersect(['art-1']);
      });

      await waitFor(() => {
        expect(preload.instances).toHaveLength(1);
      });

      act(() => {
        preload.instances[0].triggerLoad();
      });

      await waitFor(() => {
        expect(summaryArt1).toHaveClass('line-clamp-1');
      });

      act(() => {
        scrollContainer.scrollTop = 2600;
        fireEvent.scroll(scrollContainer, { target: { scrollTop: 2600 } });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('article-card-art-1-title')).not.toBeInTheDocument();
      });

      act(() => {
        useAppStore.setState((state) => ({
          ...state,
          articles: [
            ...state.articles,
            ...Array.from({ length: 20 }, (_, index) => ({
              id: `page-2-${index}`,
              feedId: 'feed-1',
              title: `Page 2 Article ${index}`,
              content: '',
              summary: `Summary page 2 ${index}`,
              publishedAt: new Date(Date.UTC(2026, 1, 10, 0, index, 0)).toISOString(),
              link: `https://example.com/page-2-${index}`,
              isRead: false,
              isStarred: false,
            })),
          ],
        }));
      });

      act(() => {
        scrollContainer.scrollTop = 0;
        fireEvent.scroll(scrollContainer, { target: { scrollTop: 0 } });
      });

      await waitFor(() => {
        expect(screen.getByTestId('article-card-art-1-title')).toBeInTheDocument();
      });

      expect(screen.getByTestId('article-card-art-1-summary')).toHaveClass('line-clamp-1');
      expect(screen.getByTestId('article-card-art-1-summary')).not.toHaveClass('line-clamp-2');
    } finally {
      getComputedStyleSpy.mockRestore();
      preload.restore();
      observer.restore();
    }
  });

  it('shows one success toast after display mode save resolves', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });

    renderWithNotifications();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    expect(await screen.findByText('已保存文章列表显示方式')).toBeInTheDocument();
    expect(screen.queryAllByText('已保存文章列表显示方式')).toHaveLength(1);
  });

  it('rolls back display mode and shows the unified notifier error when patchFeed fails', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: false,
        error: {
          code: 'internal_error',
          message: '显示模式切换失败，请稍后重试',
        },
      }),
    );

    renderWithNotifications();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL }));

    await waitFor(() => {
      const feed = useAppStore.getState().feeds.find((item) => item.id === 'feed-1');
      expect(feed?.articleListDisplayMode).toBe('card');
      expect(screen.getByText('保存文章列表显示方式失败：显示模式切换失败，请稍后重试')).toBeInTheDocument();
      expect(screen.queryByText('显示模式切换失败，请稍后重试')).not.toBeInTheDocument();
    });
  });

  it('ignores stale display mode response after view changes', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });

    type Deferred = {
      promise: Promise<Response>;
      resolve: (value: Response) => void;
    };
    const createDeferred = (): Deferred => {
      let resolve!: (value: Response) => void;
      const promise = new Promise<Response>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    };

    const patchDeferredQueue: Deferred[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = getFetchCallUrl(input);
      const method = getFetchCallMethod(input, init);
      if (url.includes('/api/feeds/') && method === 'PATCH') {
        const deferred = createDeferred();
        patchDeferredQueue.push(deferred);
        return deferred.promise;
      }
      return jsonResponse({ ok: true, data: { updated: true } });
    });

    renderWithNotifications();
    const toggleButton = screen.getByRole('button', { name: TOGGLE_TO_LIST_LABEL });

    fireEvent.click(toggleButton); // card -> list (optimistic)

    await waitFor(() => {
      expect(patchDeferredQueue).toHaveLength(1);
    });
    expect(useAppStore.getState().feeds[0].articleListDisplayMode).toBe('list');

    act(() => {
      useAppStore.setState({ selectedView: 'all' });
    });

    patchDeferredQueue[0].resolve(
      jsonResponse({
        ok: true,
        data: {
          id: 'feed-1',
          title: 'Example Feed',
          url: 'https://example.com/rss.xml',
          siteUrl: null,
          iconUrl: null,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          fetchIntervalMinutes: 30,
        },
      }),
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(useAppStore.getState().feeds[0].articleListDisplayMode).toBe('list');
  });

  it('does not commit again when unrelated app store state changes', async () => {
    let commitCount = 0;

    render(
      <React.Profiler
        id="article-list"
        onRender={() => {
          commitCount += 1;
        }}
      >
        <>
          <ToastHost />
          <ArticleList />
        </>
      </React.Profiler>,
    );

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const baselineCommitCount = commitCount;

    act(() => {
      useAppStore.setState({ sidebarCollapsed: true });
    });

    expect(commitCount).toBe(baselineCommitCount);
  });
});
