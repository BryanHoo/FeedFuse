import { beforeEach, describe, expect, it, vi } from 'vitest';

type AppStoreModule = typeof import('./appStore');
let useAppStore: AppStoreModule['useAppStore'];
let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');

  ({ useAppStore } = await import('./appStore'));
});

describe('appStore api integration', () => {
  it('maps new feed trigger flags from dto into app store feed', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/rss.xml',
                siteUrl: null,
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: true,
                bodyTranslateOnFetchEnabled: true,
                bodyTranslateOnOpenEnabled: true,
                titleTranslateEnabled: false,
                bodyTranslateEnabled: false,
                articleListDisplayMode: 'card',
                categoryId: null,
                fetchIntervalMinutes: 30,
                unreadCount: 0,
              },
            ],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });

    const feed = useAppStore.getState().feeds.find((item) => item.id === 'feed-1');
    expect(feed?.aiSummaryOnFetchEnabled).toBe(true);
    expect(feed?.bodyTranslateOnFetchEnabled).toBe(true);
    expect(feed?.bodyTranslateOnOpenEnabled).toBe(true);
  });

  it('loads snapshot into store', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [{ id: 'cat-tech', name: '科技', position: 0 }],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/rss.xml',
                siteUrl: null,
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: false,
                bodyTranslateOnFetchEnabled: false,
                bodyTranslateOnOpenEnabled: false,
                categoryId: 'cat-tech',
                fetchIntervalMinutes: 30,
                unreadCount: 1,
              },
            ],
            articles: {
              items: [
                {
                  id: 'art-1',
                  feedId: 'feed-1',
                  title: 'Hello',
                  summary: 'Summary',
                  author: null,
                  publishedAt: '2026-02-25T00:00:00.000Z',
                  link: 'https://example.com/hello',
                  isRead: false,
                  isStarred: false,
                  bodyTranslationEligible: false,
                  bodyTranslationBlockedReason: 'source_is_simplified_chinese',
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });

    expect(useAppStore.getState().categories.some((c) => c.id === 'cat-uncategorized')).toBe(true);
    expect(useAppStore.getState().categories.some((c) => c.id === 'cat-tech')).toBe(true);
    expect(useAppStore.getState().feeds[0].category).toBe('科技');
    expect(useAppStore.getState().articles[0].content).toBe('');
    expect(useAppStore.getState().articles[0].bodyTranslationEligible).toBe(false);
    expect(useAppStore.getState().articles[0].bodyTranslationBlockedReason).toBe('source_is_simplified_chinese');
  });

  it('loads feed fetch error from reader snapshot into store', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/rss.xml',
                siteUrl: null,
                iconUrl: null,
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
                fetchIntervalMinutes: 30,
                unreadCount: 0,
                lastFetchStatus: 403,
                lastFetchError: '更新失败：源站拒绝访问（HTTP 403）',
              },
            ],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });

    expect(useAppStore.getState().feeds[0].fetchStatus).toBe(403);
    expect(useAppStore.getState().feeds[0].fetchError).toBe('更新失败：源站拒绝访问（HTTP 403）');
  });

  it('optimistically marks article as read and updates unreadCount', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [{ id: 'cat-tech', name: '科技', position: 0 }],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/rss.xml',
                siteUrl: null,
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: false,
                bodyTranslateOnFetchEnabled: false,
                bodyTranslateOnOpenEnabled: false,
                categoryId: 'cat-tech',
                fetchIntervalMinutes: 30,
                unreadCount: 1,
              },
            ],
            articles: {
              items: [
                {
                  id: 'art-1',
                  feedId: 'feed-1',
                  title: 'Hello',
                  summary: 'Summary',
                  author: null,
                  publishedAt: '2026-02-25T00:00:00.000Z',
                  link: 'https://example.com/hello',
                  isRead: false,
                  isStarred: false,
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      if (url.includes('/api/articles/art-1') && method === 'PATCH') {
        return jsonResponse({ ok: true, data: { updated: true } });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });

    useAppStore.getState().markAsRead('art-1');

    expect(useAppStore.getState().articles[0].isRead).toBe(true);
    expect(useAppStore.getState().feeds[0].unreadCount).toBe(0);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/articles/art-1'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('creates feed via API, stores it, and selects it', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds') && method === 'POST') {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-new',
            title: String(body.title ?? ''),
            url: String(body.url ?? ''),
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: Boolean(body.fullTextOnOpenEnabled ?? false),
            aiSummaryOnOpenEnabled: Boolean(body.aiSummaryOnOpenEnabled ?? false),
            aiSummaryOnFetchEnabled: Boolean(body.aiSummaryOnFetchEnabled ?? false),
            bodyTranslateOnFetchEnabled: Boolean(body.bodyTranslateOnFetchEnabled ?? false),
            bodyTranslateOnOpenEnabled: Boolean(body.bodyTranslateOnOpenEnabled ?? false),
            categoryId: body.categoryId ?? null,
            fetchIntervalMinutes: 30,
            unreadCount: 0,
          },
        });
      }

      if (url.includes('/api/feeds/feed-new/refresh') && method === 'POST') {
        return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        const view = new URL(url).searchParams.get('view');
        if (view === 'feed-new') {
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [
                {
                  id: 'feed-new',
                  title: 'New Feed',
                  url: 'https://example.com/new.xml',
                  siteUrl: null,
                  iconUrl: null,
                  enabled: true,
                  fullTextOnOpenEnabled: false,
                  aiSummaryOnOpenEnabled: false,
                  aiSummaryOnFetchEnabled: false,
                  bodyTranslateOnFetchEnabled: false,
                  bodyTranslateOnOpenEnabled: false,
                  categoryId: null,
                  fetchIntervalMinutes: 30,
                  unreadCount: 1,
                },
              ],
              articles: {
                items: [
                  {
                    id: 'art-new',
                    feedId: 'feed-new',
                    title: 'Fresh Article',
                    summary: 'Summary',
                    author: null,
                    publishedAt: '2026-02-25T00:00:00.000Z',
                    link: 'https://example.com/fresh',
                    isRead: false,
                    isStarred: false,
                  },
                ],
                nextCursor: null,
              },
            },
          });
        }
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    useAppStore.getState().addFeed({
      title: 'New Feed',
      url: 'https://example.com/new.xml',
      categoryId: null,
    });

    await flushPromises();

    const added = useAppStore.getState().feeds.find((feed) => feed.id === 'feed-new');
    expect(added).toBeTruthy();
    expect(useAppStore.getState().selectedView).toBe('feed-new');
  });

  it('polls selected feed snapshot after addFeed so new articles appear without reselecting', async () => {
    let feedSnapshotCalls = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds') && method === 'POST') {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-new',
            title: String(body.title ?? ''),
            url: String(body.url ?? ''),
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            categoryId: null,
            fetchIntervalMinutes: 30,
            unreadCount: 0,
          },
        });
      }

      if (url.includes('/api/feeds/feed-new/refresh') && method === 'POST') {
        return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        const view = new URL(url).searchParams.get('view');
        if (view === 'feed-new') {
          feedSnapshotCalls += 1;
          const hasArticles = feedSnapshotCalls >= 2;

          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [
                {
                  id: 'feed-new',
                  title: 'New Feed',
                  url: 'https://example.com/new.xml',
                  siteUrl: null,
                  iconUrl: null,
                  enabled: true,
                  fullTextOnOpenEnabled: false,
                  aiSummaryOnOpenEnabled: false,
                  aiSummaryOnFetchEnabled: false,
                  bodyTranslateOnFetchEnabled: false,
                  bodyTranslateOnOpenEnabled: false,
                  categoryId: null,
                  fetchIntervalMinutes: 30,
                  unreadCount: hasArticles ? 1 : 0,
                },
              ],
              articles: {
                items: hasArticles
                  ? [
                      {
                        id: 'art-new-1',
                        feedId: 'feed-new',
                        title: 'Fresh Article',
                        summary: 'Summary',
                        author: null,
                        publishedAt: '2026-02-25T00:00:00.000Z',
                        link: 'https://example.com/fresh-article',
                        isRead: false,
                        isStarred: false,
                      },
                    ]
                  : [],
                nextCursor: null,
              },
            },
          });
        }
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    useAppStore.getState().addFeed({
      title: 'New Feed',
      url: 'https://example.com/new.xml',
      categoryId: null,
    });

    await vi.waitFor(() => {
      expect(useAppStore.getState().selectedView).toBe('feed-new');
      expect(useAppStore.getState().articles.some((item) => item.feedId === 'feed-new')).toBe(true);
    }, { timeout: 5000 });

    expect(feedSnapshotCalls).toBeGreaterThanOrEqual(2);
  });

  it('rejects when addFeed create request fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds') && method === 'POST') {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'conflict',
              message: 'feed existed',
            },
          },
          { status: 409 },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const result = useAppStore.getState().addFeed({
      title: 'Duplicated Feed',
      url: 'https://example.com/dup.xml',
      categoryId: null,
    });

    await expect(Promise.resolve(result)).rejects.toThrow();
  });

  it('updateFeed updates url and icon in store while keeping unreadCount', async () => {
    useAppStore.setState({
      categories: [],
      feeds: [
        {
          id: 'feed-1',
          title: 'Old Title',
          url: 'https://old.example.com/rss.xml',
          icon: undefined,
          unreadCount: 7,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
    });

    let snapshotCalls = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-1',
            title: 'New Title',
            url: 'https://new.example.com/rss.xml',
            siteUrl: 'https://new.example.com/',
            iconUrl:
              'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fnew.example.com',
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
            fetchIntervalMinutes: 30,
          },
        });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        snapshotCalls += 1;
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [
              {
                id: 'feed-1',
                title: 'New Title',
                url: 'https://new.example.com/rss.xml',
                siteUrl: 'https://new.example.com/',
                iconUrl:
                  'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fnew.example.com',
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
                fetchIntervalMinutes: 30,
                unreadCount: 7,
              },
            ],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore.getState().updateFeed('feed-1', {
      title: 'New Title',
      url: 'https://new.example.com/rss.xml',
      siteUrl: 'https://new.example.com/',
    });

    const updated = useAppStore.getState().feeds.find((feed) => feed.id === 'feed-1');
    expect(updated?.url).toBe('https://new.example.com/rss.xml');
    expect(updated?.icon).toBe(
      'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fnew.example.com',
    );
    expect(updated?.unreadCount).toBe(7);
    expect(snapshotCalls).toBe(1);
  });

  it('updateFeed reloads snapshot after changing category so category list stays current', async () => {
    let lastPatchBody: Record<string, unknown> | null = null;

    useAppStore.setState({
      selectedView: 'all',
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'Example',
          url: 'https://example.com/feed.xml',
          siteUrl: null,
          icon: undefined,
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
      articles: [],
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
        lastPatchBody = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-1',
            title: 'Example',
            url: 'https://example.com/feed.xml',
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: 'cat-new',
            fetchIntervalMinutes: 30,
          },
        });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        return jsonResponse({
          ok: true,
          data: {
            categories: [{ id: 'cat-new', name: '新分类', position: 0 }],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/feed.xml',
                siteUrl: null,
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: false,
                bodyTranslateOnFetchEnabled: false,
                bodyTranslateOnOpenEnabled: false,
                titleTranslateEnabled: false,
                bodyTranslateEnabled: false,
                articleListDisplayMode: 'card',
                categoryId: 'cat-new',
                fetchIntervalMinutes: 30,
                unreadCount: 2,
              },
            ],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore.getState().updateFeed('feed-1', { categoryName: '新分类' });

    expect(lastPatchBody).toEqual({ categoryName: '新分类' });
    expect(useAppStore.getState().categories.some((item) => item.name === '新分类')).toBe(true);
  });

  it('base feed update sends partial payload and drops legacy bodyTranslateEnabled', async () => {
    let lastPatchBody: Record<string, unknown> | null = null;

    useAppStore.setState({
      categories: [],
      feeds: [
        {
          id: 'feed-1',
          title: 'Old Title',
          url: 'https://old.example.com/rss.xml',
          siteUrl: 'https://old.example.com/',
          icon: undefined,
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: true,
          articleListDisplayMode: 'card',
          categoryId: null,
          category: null,
        },
      ],
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        lastPatchBody = body;
        return jsonResponse({
          ok: true,
          data: {
            id: 'feed-1',
            title: String(body.title ?? 'Old Title'),
            url: 'https://old.example.com/rss.xml',
            siteUrl: 'https://old.example.com/',
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: true,
            articleListDisplayMode: 'card',
            categoryId: null,
            fetchIntervalMinutes: 30,
          },
        });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [
              {
                id: 'feed-1',
                title: String((lastPatchBody ?? {}).title ?? 'Old Title'),
                url: 'https://old.example.com/rss.xml',
                siteUrl: 'https://old.example.com/',
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: false,
                bodyTranslateOnFetchEnabled: false,
                bodyTranslateOnOpenEnabled: false,
                titleTranslateEnabled: false,
                bodyTranslateEnabled: true,
                articleListDisplayMode: 'card',
                categoryId: null,
                fetchIntervalMinutes: 30,
                unreadCount: 1,
              },
            ],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore
      .getState()
      .updateFeed('feed-1', { title: 'Partial Update', bodyTranslateEnabled: false } as never);

    expect(lastPatchBody).toEqual({ title: 'Partial Update' });
  });

  it('removeFeed reloads snapshot after deleting the last feed in a category', async () => {
    useAppStore.setState({
      selectedView: 'feed-1',
      selectedArticleId: 'art-1',
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'Example',
          url: 'https://example.com/feed.xml',
          siteUrl: null,
          icon: undefined,
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
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
      articles: [
        {
          id: 'art-1',
          feedId: 'feed-1',
          title: 'Hello',
          content: '',
          summary: 'Summary',
          author: null,
          publishedAt: '2026-02-25T00:00:00.000Z',
          link: 'https://example.com/hello',
          isRead: false,
          isStarred: false,
        },
      ],
    });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/feeds/feed-1') && method === 'DELETE') {
        return jsonResponse({ ok: true, data: { deleted: true } });
      }

      if (url.includes('/api/reader/snapshot') && method === 'GET') {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [],
            articles: {
              items: [],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore.getState().removeFeed('feed-1');

    expect(useAppStore.getState().selectedView).toBe('all');
    expect(useAppStore.getState().selectedArticleId).toBe(null);
    expect(useAppStore.getState().feeds).toHaveLength(0);
    expect(useAppStore.getState().categories.some((item) => item.id === 'cat-tech')).toBe(false);
  });

  it('hydrates and persists reader selection via URL query params', async () => {
    window.history.replaceState({}, '', '/?view=feed-1&article=art-1');

    vi.resetModules();
    ({ useAppStore } = await import('./appStore'));

    expect(useAppStore.getState().selectedView).toBe('feed-1');
    expect(useAppStore.getState().selectedArticleId).toBe('art-1');

    useAppStore.getState().setSelectedView('starred');
    expect(window.location.search).toBe('?view=starred');

    useAppStore.setState({
      articles: [
        {
          id: 'art-2',
          feedId: 'feed-1',
          title: 'Test',
          content: 'Has content',
          summary: 'Summary',
          author: null,
          publishedAt: '2026-02-25T00:00:00.000Z',
          link: 'https://example.com/article',
          isRead: false,
          isStarred: false,
        },
      ],
    });
    useAppStore.getState().setSelectedArticle('art-2');
    expect(window.location.search).toBe('?view=starred&article=art-2');

    useAppStore.getState().setSelectedView('all');
    expect(window.location.search).toBe('');
  });

  it('fetches selected article content after snapshot load when selection is hydrated from URL', async () => {
    window.history.replaceState({}, '', '/?article=art-1');

    vi.resetModules();
    ({ useAppStore } = await import('./appStore'));

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [
              {
                id: 'feed-1',
                title: 'Example',
                url: 'https://example.com/rss.xml',
                siteUrl: null,
                iconUrl: null,
                enabled: true,
                fullTextOnOpenEnabled: false,
                aiSummaryOnOpenEnabled: false,
                aiSummaryOnFetchEnabled: false,
                bodyTranslateOnFetchEnabled: false,
                bodyTranslateOnOpenEnabled: false,
                categoryId: null,
                fetchIntervalMinutes: 30,
                unreadCount: 1,
              },
            ],
            articles: {
              items: [
                {
                  id: 'art-1',
                  feedId: 'feed-1',
                  title: 'Hello',
                  summary: null,
                  author: null,
                  publishedAt: '2026-02-25T00:00:00.000Z',
                  link: 'https://example.com/hello',
                  isRead: false,
                  isStarred: false,
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      if (url.includes('/api/articles/art-1')) {
        return jsonResponse({
          ok: true,
          data: {
            id: 'art-1',
            feedId: 'feed-1',
            dedupeKey: 'dedupe-1',
            title: 'Hello',
            link: 'https://example.com/hello',
            author: null,
            publishedAt: '2026-02-25T00:00:00.000Z',
            contentHtml: '<p>正文</p>',
            contentFullHtml: null,
            contentFullFetchedAt: null,
            contentFullError: null,
            contentFullSourceUrl: null,
            aiSummary: null,
            aiSummaryModel: null,
            aiSummarizedAt: null,
            summary: null,
            isRead: false,
            readAt: null,
            isStarred: false,
            starredAt: null,
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });
    await flushPromises();

    const selected = useAppStore.getState().articles.find((article) => article.id === 'art-1');
    expect(selected?.content).toContain('正文');
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/api/articles/art-1')),
    ).toBe(true);
  });
});
