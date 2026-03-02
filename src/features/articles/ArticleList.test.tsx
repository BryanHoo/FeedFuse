import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ViewType } from '../../types';

type ArticleListModule = typeof import('./ArticleList');
type AppStoreModule = typeof import('../../store/appStore');
type NotificationModule = typeof import('../notifications/NotificationProvider');
type LoadSnapshot = (input?: { view?: ViewType }) => Promise<void>;

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

describe('ArticleList', () => {
  let ArticleList: ArticleListModule['default'];
  let useAppStore: AppStoreModule['useAppStore'];
  let NotificationProvider: NotificationModule['NotificationProvider'];
  let fetchMock: ReturnType<typeof vi.fn>;

  function renderWithNotifications() {
    return render(
      <NotificationProvider>
        <ArticleList />
      </NotificationProvider>,
    );
  }

  beforeEach(async () => {
    vi.resetModules();
    fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

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
        const body = JSON.parse(String(init?.body ?? '{}')) as {
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
    ({ NotificationProvider } = await import('../notifications/NotificationProvider'));
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

    fireEvent.click(screen.getByRole('button', { name: 'mark-all-as-read' }));

    expect(screen.getByText('Selected Article')).toBeInTheDocument();
    expect(screen.queryByText('Other Article')).not.toBeInTheDocument();
    expect(screen.getByText('0 篇')).toBeInTheDocument();
  });

  it('renders preview image only after preload succeeds', async () => {
    const previewImageUrl = 'https://example.com/preview.jpg';
    const preload = setupImagePreloadMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1' ? { ...article, previewImage: previewImageUrl } : article,
      ),
    }));

    try {
      const { container } = renderWithNotifications();

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
    }
  });

  it('keeps preview image hidden when preload fails', () => {
    const brokenImageUrl = 'https://example.com/broken-preview.jpg';
    const preload = setupImagePreloadMock();

    useAppStore.setState((state) => ({
      ...state,
      articles: state.articles.map((article) =>
        article.id === 'art-1' ? { ...article, previewImage: brokenImageUrl } : article,
      ),
    }));

    try {
      const { container } = renderWithNotifications();

      expect(preload.instances).toHaveLength(1);
      expect(container.querySelector(`img[src="${brokenImageUrl}"]`)).not.toBeInTheDocument();

      act(() => {
        preload.instances[0].triggerError();
      });

      expect(container.querySelector(`img[src="${brokenImageUrl}"]`)).not.toBeInTheDocument();
    } finally {
      preload.restore();
    }
  });

  it.each(['all', 'unread', 'starred'] as const)(
    'refreshes all enabled feeds in %s view',
    async (view) => {
      vi.useFakeTimers();
      try {
        const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
        useAppStore.setState({
          selectedView: view,
          selectedArticleId: null,
          loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
        });

        renderWithNotifications();

        await act(async () => {
          fireEvent.click(screen.getByRole('button', { name: 'refresh-feeds' }));
          await vi.runAllTimersAsync();
        });

        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/api/feeds/refresh'),
          expect.objectContaining({ method: 'POST' }),
        );
        expect(loadSnapshotMock).toHaveBeenCalledWith({ view });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it('refreshes selected feed in feed view', async () => {
    vi.useFakeTimers();
    try {
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({
        selectedView: 'feed-1',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'refresh-feeds' }));
        await vi.runAllTimersAsync();
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/feeds/feed-1/refresh'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(loadSnapshotMock).toHaveBeenCalledWith({ view: 'feed-1' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows success notification when refreshing all feeds starts', async () => {
    vi.useFakeTimers();
    try {
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({
        selectedView: 'all',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'refresh-feeds' }));
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

  it('shows error notification when refreshing all feeds fails', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        ok: false,
        error: {
          code: 'unknown_error',
          message: 'Refresh failed',
        },
      }),
    );

    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    fireEvent.click(screen.getByRole('button', { name: 'refresh-feeds' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('操作失败：Refresh failed');
    });
  });

  it('shows success notification when refreshing all feeds completes', async () => {
    vi.useFakeTimers();
    try {
      const loadSnapshotMock = vi.fn().mockResolvedValue(undefined);
      useAppStore.setState({
        selectedView: 'all',
        selectedArticleId: null,
        loadSnapshot: loadSnapshotMock as unknown as LoadSnapshot,
      });

      renderWithNotifications();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'refresh-feeds' }));
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });

      expect(screen.getByText('已完成刷新全部订阅源')).toBeInTheDocument();
      expect(loadSnapshotMock).toHaveBeenCalledTimes(12);
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

    expect(screen.getByRole('button', { name: 'refresh-feeds' })).toBeDisabled();
  });

  it('shows selected feed title in header when viewing a specific feed', () => {
    useAppStore.setState({ selectedView: 'feed-1' });

    renderWithNotifications();

    expect(screen.getByRole('heading', { level: 2, name: 'Example Feed' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: '文章' })).not.toBeInTheDocument();
  });

  it('shows display mode toggle only in feed view and hides it in all/unread/starred views', () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    expect(screen.getByRole('button', { name: 'toggle-display-mode' })).toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'all' });
    });
    expect(screen.queryByRole('button', { name: 'toggle-display-mode' })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'unread' });
    });
    expect(screen.queryByRole('button', { name: 'toggle-display-mode' })).not.toBeInTheDocument();

    act(() => {
      useAppStore.setState({ selectedView: 'starred' });
    });
    expect(screen.queryByRole('button', { name: 'toggle-display-mode' })).not.toBeInTheDocument();
  });

  it('renders refresh icon before display mode toggle icon in feed view', () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    const refreshButton = screen.getByRole('button', { name: 'refresh-feeds' });
    const toggleDisplayModeButton = screen.getByRole('button', { name: 'toggle-display-mode' });
    const relation = refreshButton.compareDocumentPosition(toggleDisplayModeButton);

    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders list row with left title, right time, and unread dot after switching to list mode', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    renderWithNotifications();

    fireEvent.click(screen.getByRole('button', { name: 'toggle-display-mode' }));

    expect(
      await screen.findByTestId('article-list-row-art-1-title'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('article-list-row-art-1-time')).toBeInTheDocument();
    expect(screen.getByTestId('article-list-row-art-1-unread-dot')).toBeInTheDocument();
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

  it('rolls back display mode and shows error when patchFeed fails', async () => {
    useAppStore.setState({ selectedView: 'feed-1' });
    fetchMock.mockRejectedValueOnce(new Error('network'));

    renderWithNotifications();
    fireEvent.click(screen.getByRole('button', { name: 'toggle-display-mode' }));

    await waitFor(() => {
      const feed = useAppStore.getState().feeds.find((item) => item.id === 'feed-1');
      expect(feed?.articleListDisplayMode).toBe('card');
      expect(screen.getByRole('alert')).toHaveTextContent('操作失败，请稍后重试。');
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
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/api/feeds/') && method === 'PATCH') {
        const deferred = createDeferred();
        patchDeferredQueue.push(deferred);
        return deferred.promise;
      }
      return jsonResponse({ ok: true, data: { updated: true } });
    });

    renderWithNotifications();
    const toggleButton = screen.getByRole('button', { name: 'toggle-display-mode' });

    fireEvent.click(toggleButton); // card -> list (optimistic)

    expect(patchDeferredQueue).toHaveLength(1);
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
});
