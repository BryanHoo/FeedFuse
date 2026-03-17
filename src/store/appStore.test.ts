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

async function getFetchCallJsonBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Record<string, unknown>> {
  let bodyText: string | undefined;

  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      bodyText = await input.text();
    } catch {
      bodyText = undefined;
    }
  } else if (typeof init?.body === 'string') {
    bodyText = init.body;
  }

  if (!bodyText) return {};
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // ignore
  }
  return {};
}

async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createSnapshotFeed(id: string, title: string, unreadCount = 1) {
  return {
    id,
    title,
    url: `https://example.com/${id}.xml`,
    siteUrl: `https://example.com/${id}`,
    iconUrl: null,
    enabled: true,
    fullTextOnOpenEnabled: false,
    aiSummaryOnOpenEnabled: false,
    aiSummaryOnFetchEnabled: false,
    bodyTranslateOnFetchEnabled: false,
    bodyTranslateOnOpenEnabled: false,
    titleTranslateEnabled: false,
    bodyTranslateEnabled: false,
    articleListDisplayMode: 'card' as const,
    categoryId: null,
    fetchIntervalMinutes: 30,
    lastFetchStatus: null,
    lastFetchError: null,
    unreadCount,
  };
}

function createSnapshotArticle(id: string, feedId: string, title: string) {
  return {
    id,
    feedId,
    title,
    titleOriginal: title,
    titleZh: null,
    summary: `${title} summary`,
    previewImage: null,
    author: null,
    publishedAt: '2026-03-09T10:00:00.000Z',
    link: `https://example.com/articles/${id}`,
    isRead: false,
    isStarred: false,
    bodyTranslationEligible: false,
    bodyTranslationBlockedReason: null,
  };
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
  it('keeps snapshot loading failures silent', async () => {
    const { setApiErrorNotifier, clearApiErrorNotifier } = await import('../lib/apiErrorNotifier');
    const notifyError = vi.fn();
    setApiErrorNotifier(notifyError);

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = getFetchCallUrl(input);
      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'internal_error',
              message: '服务暂时不可用，请稍后重试',
            },
          },
          { status: 500 },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });

    expect(notifyError).not.toHaveBeenCalled();
    clearApiErrorNotifier();
  });

  it('notifies for optimistic write failures started from store actions', async () => {
    const { setApiErrorNotifier, clearApiErrorNotifier } = await import('../lib/apiErrorNotifier');
    const notifyError = vi.fn();
    setApiErrorNotifier(notifyError);

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getFetchCallUrl(input);
      const method = getFetchCallMethod(input, init);

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
                  id: 'article-1',
                  feedId: 'feed-1',
                  title: 'Hello',
                  summary: null,
                  author: null,
                  publishedAt: null,
                  link: null,
                  isRead: false,
                  isStarred: false,
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      if (url.includes('/api/articles/article-1') && method === 'PATCH') {
        return jsonResponse(
          {
            ok: false,
            error: {
              code: 'internal_error',
              message: '更新失败，请稍后重试',
            },
          },
          { status: 500 },
        );
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });
    useAppStore.getState().markAsRead('article-1');
    await flushPromises();

    expect(notifyError).toHaveBeenCalledWith('更新失败，请稍后重试');
    clearApiErrorNotifier();
  });

	  it('maps new feed trigger flags from dto into app store feed', async () => {
	    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
	      const url = getFetchCallUrl(input);
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
	      const url = getFetchCallUrl(input);
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
	      const url = getFetchCallUrl(input);
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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

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
    await flushPromises();

    expect(useAppStore.getState().articles[0].isRead).toBe(true);
    expect(useAppStore.getState().feeds[0].unreadCount).toBe(0);

    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          getFetchCallUrl(input).includes('/api/articles/art-1') &&
          getFetchCallMethod(input, init).toUpperCase() === 'PATCH',
      ),
    ).toBe(true);
  });

	  it('creates feed via API, stores it, and selects it', async () => {
	    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

	      if (url.includes('/api/feeds') && method === 'POST') {
	        const body = await getFetchCallJsonBody(input, init);
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
      const url = getFetchCallUrl(input);
      const method = getFetchCallMethod(input, init);

      if (url.includes('/api/feeds') && method === 'POST') {
        const body = await getFetchCallJsonBody(input, init);
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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

	      if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
	        lastPatchBody = await getFetchCallJsonBody(input, init);
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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

	      if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
	        const body = await getFetchCallJsonBody(input, init);
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
	      const url = getFetchCallUrl(input);
	      const method = getFetchCallMethod(input, init);

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

  it('restores cached articles immediately when switching back to a previously loaded feed', async () => {
    const feeds = [
      createSnapshotFeed('feed-1', 'Feed One', 2),
      createSnapshotFeed('feed-2', 'Feed Two', 3),
    ];
    const snapshotByView = {
      'feed-1': {
        categories: [],
        feeds,
        articles: {
          items: [createSnapshotArticle('art-feed-1', 'feed-1', 'Feed One Article')],
          nextCursor: null,
        },
      },
      'feed-2': {
        categories: [],
        feeds,
        articles: {
          items: [createSnapshotArticle('art-feed-2', 'feed-2', 'Feed Two Article')],
          nextCursor: null,
        },
      },
    } satisfies Record<string, unknown>;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(getFetchCallUrl(input), 'https://example.com');
      const method = getFetchCallMethod(input, init);

      if (url.pathname === '/api/reader/snapshot' && method === 'GET') {
        const view = url.searchParams.get('view') ?? 'all';
        const snapshot = snapshotByView[view as keyof typeof snapshotByView];
        if (!snapshot) {
          throw new Error(`Unexpected snapshot view: ${view}`);
        }
        return jsonResponse({ ok: true, data: snapshot });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
    });

    useAppStore.setState({ selectedView: 'feed-1', selectedArticleId: null });
    await useAppStore.getState().loadSnapshot({ view: 'feed-1' });

    useAppStore.getState().setSelectedView('feed-2');
    await useAppStore.getState().loadSnapshot({ view: 'feed-2' });

    useAppStore.getState().setSelectedView('feed-1');
    await useAppStore.getState().loadSnapshot({ view: 'feed-1' });

    useAppStore.getState().setSelectedView('feed-2');

    expect(useAppStore.getState().selectedView).toBe('feed-2');
    expect(useAppStore.getState().articles.map((article) => article.id)).toEqual(['art-feed-2']);
  });

  it('keeps foreground articles stable when loading a background view snapshot', async () => {
    const feeds = [
      createSnapshotFeed('feed-1', 'Feed One', 5),
      createSnapshotFeed('feed-2', 'Feed Two', 1),
    ];
    const snapshotByView = {
      'feed-1': {
        categories: [],
        feeds,
        articles: {
          items: [createSnapshotArticle('art-feed-1', 'feed-1', 'Feed One Article')],
          nextCursor: null,
        },
      },
      'feed-2': {
        categories: [],
        feeds,
        articles: {
          items: [createSnapshotArticle('art-feed-2', 'feed-2', 'Feed Two Article')],
          nextCursor: null,
        },
      },
    } satisfies Record<string, unknown>;

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(getFetchCallUrl(input), 'https://example.com');
      const method = getFetchCallMethod(input, init);

      if (url.pathname === '/api/reader/snapshot' && method === 'GET') {
        const view = url.searchParams.get('view') ?? 'all';
        const snapshot = snapshotByView[view as keyof typeof snapshotByView];
        if (!snapshot) {
          throw new Error(`Unexpected snapshot view: ${view}`);
        }
        return jsonResponse({ ok: true, data: snapshot });
      }

      throw new Error(`Unexpected fetch: ${method} ${url.pathname}`);
    });

    useAppStore.setState({
      selectedView: 'feed-2',
      selectedArticleId: null,
      feeds: feeds.map((feed) => ({
        id: feed.id,
        title: feed.title,
        url: feed.url,
        siteUrl: feed.siteUrl,
        icon: undefined,
        unreadCount: feed.unreadCount,
        enabled: feed.enabled,
        fullTextOnOpenEnabled: feed.fullTextOnOpenEnabled,
        aiSummaryOnOpenEnabled: feed.aiSummaryOnOpenEnabled,
        aiSummaryOnFetchEnabled: feed.aiSummaryOnFetchEnabled,
        bodyTranslateOnFetchEnabled: feed.bodyTranslateOnFetchEnabled,
        bodyTranslateOnOpenEnabled: feed.bodyTranslateOnOpenEnabled,
        titleTranslateEnabled: feed.titleTranslateEnabled,
        bodyTranslateEnabled: feed.bodyTranslateEnabled,
        articleListDisplayMode: feed.articleListDisplayMode,
        categoryId: feed.categoryId,
        category: null,
        fetchStatus: feed.lastFetchStatus,
        fetchError: feed.lastFetchError,
      })),
      articles: [
        {
          id: 'art-feed-2',
          feedId: 'feed-2',
          title: 'Feed Two Article',
          content: '',
          summary: 'Feed Two Article summary',
          author: null,
          publishedAt: '2026-03-09T10:00:00.000Z',
          link: 'https://example.com/articles/art-feed-2',
          isRead: false,
          isStarred: false,
          bodyTranslationEligible: false,
          bodyTranslationBlockedReason: null,
        },
      ],
      snapshotLoading: false,
    });

    const loadingTransitions: boolean[] = [];
    const unsubscribe = useAppStore.subscribe((state, previousState) => {
      if (state.snapshotLoading !== previousState.snapshotLoading) {
        loadingTransitions.push(state.snapshotLoading);
      }
    });

    try {
      await useAppStore.getState().loadSnapshot({ view: 'feed-1' });
    } finally {
      unsubscribe();
    }

    expect(useAppStore.getState().selectedView).toBe('feed-2');
    expect(useAppStore.getState().articles.map((article) => article.id)).toEqual(['art-feed-2']);
    expect(useAppStore.getState().snapshotLoading).toBe(false);
    expect(loadingTransitions).toEqual([]);

    useAppStore.getState().setSelectedView('feed-1');
    expect(useAppStore.getState().articles.map((article) => article.id)).toEqual(['art-feed-1']);
  });

  it('fetches selected article content after snapshot load when selection is hydrated from URL', async () => {
    window.history.replaceState({}, '', '/?article=art-1');

    vi.resetModules();
    ({ useAppStore } = await import('./appStore'));

	    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
	      const url = getFetchCallUrl(input);

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
	      fetchMock.mock.calls.some(([input]) => getFetchCallUrl(input).includes('/api/articles/art-1')),
	    ).toBe(true);
	  });

  it('keeps selected article detail when refreshing the visible snapshot', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = getFetchCallUrl(input);

      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [createSnapshotFeed('feed-1', 'Example', 2)],
            articles: {
              items: [
                {
                  ...createSnapshotArticle('art-1', 'feed-1', 'Hello'),
                  summary: 'Fresh summary',
                  isRead: true,
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      if (url.includes('/api/articles/art-1')) {
        throw new Error('Selected article should not be re-fetched during snapshot refresh');
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: 'art-1',
      feeds: [
        {
          id: 'feed-1',
          title: 'Example',
          url: 'https://example.com/feed-1.xml',
          siteUrl: 'https://example.com/feed-1',
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
          categoryId: null,
          category: null,
          fetchStatus: null,
          fetchError: null,
        },
      ],
      articles: [
        {
          id: 'art-1',
          feedId: 'feed-1',
          title: 'Hello',
          titleOriginal: 'Hello',
          titleZh: '你好',
          content: '<p>Loaded article body</p>',
          aiSummary: '已生成摘要',
          aiSummarySession: {
            id: 'summary-session-1',
            status: 'running',
            draftText: 'TL;DR',
            finalText: null,
            errorCode: null,
            errorMessage: null,
            startedAt: '2026-03-09T10:00:00.000Z',
            finishedAt: null,
            updatedAt: '2026-03-09T10:00:05.000Z',
          },
          aiTranslationZhHtml: '<p>翻译正文</p>',
          summary: 'Old summary',
          author: 'Author',
          publishedAt: '2026-03-09T10:00:00.000Z',
          link: 'https://example.com/articles/art-1',
          isRead: false,
          isStarred: false,
          bodyTranslationEligible: true,
          bodyTranslationBlockedReason: null,
        },
      ],
      articleSnapshotCache: {},
      snapshotLoading: false,
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });
    await flushPromises();

    const selected = useAppStore.getState().articles.find((article) => article.id === 'art-1');
    expect(selected).toMatchObject({
      id: 'art-1',
      content: '<p>Loaded article body</p>',
      aiSummary: '已生成摘要',
      aiTranslationZhHtml: '<p>翻译正文</p>',
      summary: 'Fresh summary',
      isRead: true,
    });
    expect(selected?.aiSummarySession?.status).toBe('running');
    expect(
      fetchMock.mock.calls.some(([input]) => getFetchCallUrl(input).includes('/api/articles/art-1')),
    ).toBe(false);
  });

  it('keeps aiDigestSources when snapshot refresh merges selected article details', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = getFetchCallUrl(input);

      if (url.includes('/api/reader/snapshot')) {
        return jsonResponse({
          ok: true,
          data: {
            categories: [],
            feeds: [createSnapshotFeed('feed-1', 'AI解读', 1)],
            articles: {
              items: [
                {
                  ...createSnapshotArticle('art-1', 'feed-1', 'Digest'),
                  summary: 'new summary',
                },
              ],
              nextCursor: null,
            },
          },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: 'art-1',
      feeds: [
        {
          id: 'feed-1',
          kind: 'ai_digest',
          title: 'AI解读',
          url: 'https://example.com/feed-1.xml',
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
        },
      ],
      articles: [
        {
          id: 'art-1',
          feedId: 'feed-1',
          title: 'Digest',
          content: '<p>loaded</p>',
          summary: 'old',
          publishedAt: '2026-03-17T00:00:00.000Z',
          link: 'https://example.com/digest',
          isRead: false,
          isStarred: false,
          aiDigestSources: [
            {
              articleId: 'src-1',
              feedId: 'feed-rss-1',
              feedTitle: 'RSS 1',
              title: '来源1',
              link: null,
              publishedAt: null,
              position: 0,
            },
          ],
        },
      ],
      articleSnapshotCache: {},
      snapshotLoading: false,
    });

    await useAppStore.getState().loadSnapshot({ view: 'all' });
    const selected = useAppStore.getState().articles.find((article) => article.id === 'art-1');
    expect(selected?.aiDigestSources?.[0]?.articleId).toBe('src-1');
  });

  it('refreshArticle keeps hasAiSummary semantics and stores aiSummarySession', async () => {
    useAppStore.setState({
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Hello',
          content: '',
          summary: '',
          publishedAt: '2026-03-09T00:00:00.000Z',
          link: 'https://example.com/a1',
          isRead: false,
          isStarred: false,
        },
      ],
    });

	    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
	      const url = getFetchCallUrl(input);
	      if (url.includes('/api/articles/article-1')) {
	        return jsonResponse({
          ok: true,
          data: {
            id: 'article-1',
            feedId: 'feed-1',
            dedupeKey: 'guid:1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            link: 'https://example.com/a1',
            author: null,
            publishedAt: '2026-03-09T00:00:00.000Z',
            contentHtml: '<p>rss</p>',
            contentFullHtml: null,
            contentFullFetchedAt: null,
            contentFullError: null,
            contentFullSourceUrl: null,
            aiSummary: null,
            aiSummaryModel: null,
            aiSummarizedAt: null,
            aiSummarySession: {
              id: 'session-1',
              status: 'running',
              draftText: 'TL;DR',
              finalText: null,
              errorCode: null,
              errorMessage: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              updatedAt: '2026-03-09T00:00:10.000Z',
            },
            aiTranslationBilingualHtml: null,
            aiTranslationZhHtml: null,
            aiTranslationModel: null,
            aiTranslatedAt: null,
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

    const result = await useAppStore.getState().refreshArticle('article-1');

    expect(result.hasAiSummary).toBe(false);
    expect(useAppStore.getState().articles[0]?.aiSummarySession?.status).toBe('running');
  });
});
