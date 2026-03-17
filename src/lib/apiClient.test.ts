import { describe, expect, it, vi } from 'vitest';
import type { ReaderSnapshotDto } from './apiClient';
import { mapArticleDto, mapFeedDto, mapSnapshotArticleItem } from './apiClient';

function getFetchCallUrl(input: unknown): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getFetchCallMethod(call: unknown[]): string | undefined {
  const [input, init] = call;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  if (init && typeof init === 'object' && 'method' in init) {
    const method = (init as { method?: unknown }).method;
    return typeof method === 'string' ? method : undefined;
  }
  return undefined;
}

function getFetchCallHeader(call: unknown[], name: string): string | undefined {
  const lowerName = name.toLowerCase();
  const [input, init] = call;

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.headers.get(name) ?? undefined;
  }

  if (!init || typeof init !== 'object' || !('headers' in init)) return undefined;
  const headers = (init as { headers?: unknown }).headers;
  if (!headers) return undefined;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && String(entry[0]).toLowerCase() === lowerName) {
        return String(entry[1]);
      }
    }
    return undefined;
  }

  if (typeof headers === 'object') {
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
      if (key.toLowerCase() === lowerName) return typeof value === 'string' ? value : String(value);
    }
  }

  return undefined;
}

describe('mapFeedDto', () => {
  it('maps kind', () => {
    const mapped = mapFeedDto(
      {
        id: 'feed-0',
        kind: 'ai_digest',
        title: 'Digest',
        url: 'http://localhost/__feedfuse_ai_digest__/feed-0',
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
        lastFetchStatus: null,
        lastFetchError: null,
      } as Parameters<typeof mapFeedDto>[0],
      [],
    );

    expect(mapped.kind).toBe('ai_digest');
  });

  it('maps fetch result fields from snapshot feeds', () => {
    const mapped = mapFeedDto(
      {
        id: 'feed-1',
        kind: 'rss',
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
      [],
    );

    expect(mapped.fetchStatus).toBe(403);
    expect(mapped.fetchError).toBe('更新失败：源站拒绝访问（HTTP 403）');
  });

  it('defaults missing fetch result fields to null for create/edit payloads', () => {
    const mapped = mapFeedDto(
      {
        id: 'feed-2',
        kind: 'rss',
        title: 'Created Feed',
        url: 'https://example.com/new.xml',
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
      } as Parameters<typeof mapFeedDto>[0],
      [],
    );

    expect(mapped.fetchStatus).toBeNull();
    expect(mapped.fetchError).toBeNull();
  });
});

describe('mapSnapshotArticleItem', () => {
  it('maps preview image from snapshot payload', () => {
    const dto: ReaderSnapshotDto['articles']['items'][number] = {
      id: 'article-1',
      feedId: 'feed-1',
      title: 'Test Article',
      summary: 'Summary',
      author: 'Author',
      publishedAt: '2026-01-01T00:00:00.000Z',
      link: 'https://example.com/article',
      isRead: false,
      isStarred: false,
      previewImage: 'https://example.com/preview.jpg',
    };

    const mapped = mapSnapshotArticleItem(dto);

    expect(mapped.previewImage).toBe('https://example.com/preview.jpg');
    expect(mapped.content).toBe('');
  });

  it('prefers titleZh and keeps title/titleOriginal fields from snapshot payload', () => {
    const dto = {
      id: 'article-2',
      feedId: 'feed-1',
      title: 'Original title',
      titleOriginal: 'Original title',
      titleZh: '译文标题',
      summary: 'Summary',
      author: 'Author',
      publishedAt: '2026-01-01T00:00:00.000Z',
      link: 'https://example.com/article-2',
      isRead: false,
      isStarred: false,
    } as ReaderSnapshotDto['articles']['items'][number] & {
      titleOriginal: string;
      titleZh: string | null;
    };

    const mapped = mapSnapshotArticleItem(dto);

    expect(mapped.title).toBe('译文标题');
    expect(mapped.titleOriginal).toBe('Original title');
    expect(mapped.titleZh).toBe('译文标题');
  });
});

it('mapArticleDto prefers contentFullHtml', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    titleOriginal: 't',
    titleZh: null,
    link: 'https://example.com',
    author: null,
    publishedAt: null,
    contentHtml: '<p>rss</p>',
    contentFullHtml: '<p>full</p>',
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: null,
    aiTranslationZhHtml: null,
    aiTranslationModel: null,
    aiTranslatedAt: null,
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
  });
  expect(mapped.content).toContain('full');
});

it('mapArticleDto maps aiDigestSources', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 'digest',
    titleOriginal: 'digest',
    titleZh: null,
    link: null,
    author: null,
    publishedAt: null,
    contentHtml: '<p>digest</p>',
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: null,
    aiTranslationZhHtml: null,
    aiTranslationModel: null,
    aiTranslatedAt: null,
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
    aiDigestSources: [
      {
        articleId: 'a-1',
        feedId: 'f-1',
        feedTitle: 'Feed 1',
        title: 'Source 1',
        link: 'https://example.com/s1',
        publishedAt: '2026-03-17T00:00:00.000Z',
        position: 0,
      },
    ],
  });

  expect(mapped.aiDigestSources?.[0]?.articleId).toBe('a-1');
});

it('mapArticleDto maps aiTranslationZhHtml', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    titleOriginal: 't',
    titleZh: null,
    link: 'https://example.com',
    author: null,
    publishedAt: null,
    contentHtml: '<p>rss</p>',
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: null,
    aiTranslationZhHtml: '<p>你好</p>',
    aiTranslationModel: 'gpt-4o-mini',
    aiTranslatedAt: '2026-03-02T00:00:00.000Z',
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
  });

  expect(mapped.aiTranslationZhHtml).toContain('你好');
});

it('mapArticleDto maps bilingual translation and title fields', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    titleOriginal: 'Original title',
    titleZh: '原始标题',
    link: 'https://example.com',
    author: null,
    publishedAt: null,
    contentHtml: '<p>rss</p>',
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: '<div class="ff-bilingual-block">...</div>',
    aiTranslationZhHtml: null,
    aiTranslationModel: 'gpt-4o-mini',
    aiTranslatedAt: '2026-03-02T00:00:00.000Z',
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
  });

  expect(mapped.titleOriginal).toBe('Original title');
  expect(mapped.titleZh).toBe('原始标题');
  expect(mapped.aiTranslationBilingualHtml).toContain('ff-bilingual-block');
});

it('mapArticleDto maps aiSummarySession snapshot', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    titleOriginal: 't',
    titleZh: null,
    link: 'https://example.com',
    author: null,
    publishedAt: null,
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
  });

  expect(mapped.aiSummarySession?.draftText).toBe('TL;DR');
  expect(mapped.aiSummarySession?.finalText).toBeNull();
});

it('maps body translation eligibility from article dto and snapshot items', () => {
  expect(
    mapArticleDto({
      id: 'article-1',
      feedId: 'feed-1',
      dedupeKey: 'dedupe',
      title: '标题',
      titleOriginal: '标题',
      titleZh: null,
      link: null,
      author: null,
      publishedAt: null,
      contentHtml: '<p>正文</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
    }).bodyTranslationEligible,
  ).toBe(false);

  expect(
    mapSnapshotArticleItem({
      id: 'article-1',
      feedId: 'feed-1',
      title: '标题',
      summary: null,
      previewImage: null,
      author: null,
      publishedAt: null,
      link: null,
      isRead: false,
      isStarred: false,
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
    }).bodyTranslationBlockedReason,
  ).toBe('source_is_simplified_chinese');
});

it('importOpml posts JSON content to /api/opml/import', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          importedCount: 1,
          duplicateCount: 0,
          invalidCount: 0,
          createdCategoryCount: 0,
          duplicates: [],
          invalidItems: [],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { importOpml } = await import('./apiClient');
  await importOpml({ content: '<opml />', fileName: 'feeds.opml' });

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain('/api/opml/import');
  expect(getFetchCallMethod(firstCall)).toBe('POST');
  expect(getFetchCallHeader(firstCall, 'content-type')).toBe('application/json');
});

it('exportOpml reads XML text and filename without using requestApi JSON envelope', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response('<?xml version="1.0"?><opml version="2.0"></opml>', {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'content-disposition': 'attachment; filename="feedfuse-subscriptions.opml"',
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { exportOpml } = await import('./apiClient');
  const result = await exportOpml();

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain('/api/opml/export');
  expect(getFetchCallMethod(firstCall) ?? 'GET').toBe('GET');
  expect(result.fileName).toBe('feedfuse-subscriptions.opml');
  expect(result.xml).toContain('<opml version="2.0">');
});

it('exportOpml throws ApiError when download endpoint returns JSON error envelope', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'validation_error',
          message: 'OPML 导出失败',
        },
      }),
      {
        status: 400,
        headers: { 'content-type': 'application/json' },
      },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { ApiError, exportOpml } = await import('./apiClient');

  await expect(exportOpml()).rejects.toBeInstanceOf(ApiError);
  await expect(exportOpml()).rejects.toMatchObject({
    code: 'validation_error',
    message: 'OPML 导出失败',
    status: 400,
  });
});

describe('refreshAllFeeds', () => {
  it('POSTs /api/feeds/refresh', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const mod = (await import('./apiClient')) as Record<string, unknown>;
    const refreshAllFeeds = mod.refreshAllFeeds as undefined | (() => Promise<unknown>);
    expect(refreshAllFeeds).toBeTypeOf('function');

    await refreshAllFeeds?.();

    const firstCall = fetchMock.mock.calls[0] ?? [];
    expect(getFetchCallUrl(firstCall[0])).toContain('/api/feeds/refresh');
    expect(getFetchCallMethod(firstCall)).toBe('POST');
  });
});

it('throws ApiError invalid_response when response is not an envelope', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { ApiError, refreshAllFeeds } = await import('./apiClient');

  await expect(refreshAllFeeds()).rejects.toBeInstanceOf(ApiError);
  await expect(refreshAllFeeds()).rejects.toMatchObject({ code: 'invalid_response' });
});

it('enqueueArticleAiTranslate POSTs /api/articles/:id/ai-translate', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { enqueueArticleAiTranslate } = await import('./apiClient');
  await enqueueArticleAiTranslate('00000000-0000-0000-0000-000000000000');

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-translate',
  );
  expect(getFetchCallMethod(firstCall)).toBe('POST');
});

it('enqueueArticleFulltext sends force in request body when provided', async () => {
  let sentBodyText: string | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      sentBodyText = await input.text();
    }
    return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { enqueueArticleFulltext } = await import('./apiClient');
  await enqueueArticleFulltext('00000000-0000-0000-0000-000000000000', { force: true });

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/fulltext',
  );
  expect(getFetchCallMethod(firstCall)).toBe('POST');
  expect(getFetchCallHeader(firstCall, 'content-type')).toBe('application/json');
  expect(sentBodyText).toBe(JSON.stringify({ force: true }));
});

it('enqueueArticleAiSummary sends force in request body when provided', async () => {
  let sentBodyText: string | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      sentBodyText = await input.text();
    }
    return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { enqueueArticleAiSummary } = await import('./apiClient');
  await enqueueArticleAiSummary('00000000-0000-0000-0000-000000000000', { force: true });

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-summary',
  );
  expect(getFetchCallMethod(firstCall)).toBe('POST');
  expect(sentBodyText).toBe(JSON.stringify({ force: true }));
});

it('enqueueArticleAiTranslate sends force in request body when provided', async () => {
  let sentBodyText: string | undefined;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (typeof Request !== 'undefined' && input instanceof Request) {
      sentBodyText = await input.text();
    }
    return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { enqueueArticleAiTranslate } = await import('./apiClient');
  await enqueueArticleAiTranslate('00000000-0000-0000-0000-000000000000', { force: true });

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-translate',
  );
  expect(getFetchCallMethod(firstCall)).toBe('POST');
  expect(sentBodyText).toBe(JSON.stringify({ force: true }));
});

it('getArticleAiTranslateSnapshot GETs /api/articles/:id/ai-translate', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          session: null,
          segments: [],
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { getArticleAiTranslateSnapshot } = await import('./apiClient');
  await getArticleAiTranslateSnapshot('00000000-0000-0000-0000-000000000000');

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-translate',
  );
  expect(getFetchCallMethod(firstCall) ?? 'GET').toBe('GET');
});

it('retryArticleAiTranslateSegment POSTs /api/articles/:id/ai-translate/segments/:index/retry', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: { enqueued: true, jobId: 'job-retry-1' },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { retryArticleAiTranslateSegment } = await import('./apiClient');
  await retryArticleAiTranslateSegment('00000000-0000-0000-0000-000000000000', 3);

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-translate/segments/3/retry',
  );
  expect(getFetchCallMethod(firstCall)).toBe('POST');
});

it('createArticleAiTranslateEventSource uses stream endpoint', async () => {
  class MockEventSource {
    constructor(
      public url: string,
      public options?: EventSourceInit,
    ) {}
  }

  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);

  const { createArticleAiTranslateEventSource } = await import('./apiClient');
  const eventSource = createArticleAiTranslateEventSource(
    '00000000-0000-0000-0000-000000000000',
  ) as unknown as MockEventSource;

  expect(eventSource.url).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-translate/stream',
  );
});

it('getArticleAiSummarySnapshot GETs /api/articles/:id/ai-summary', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          session: null,
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { getArticleAiSummarySnapshot } = await import('./apiClient');
  await getArticleAiSummarySnapshot('00000000-0000-0000-0000-000000000000');

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-summary',
  );
  expect(getFetchCallMethod(firstCall) ?? 'GET').toBe('GET');
});

it('createArticleAiSummaryEventSource uses stream endpoint', async () => {
  class MockEventSource {
    constructor(
      public url: string,
      public options?: EventSourceInit,
    ) {}
  }

  vi.stubGlobal('EventSource', MockEventSource as unknown as typeof EventSource);

  const { createArticleAiSummaryEventSource } = await import('./apiClient');
  const eventSource = createArticleAiSummaryEventSource(
    '00000000-0000-0000-0000-000000000000',
  ) as unknown as MockEventSource;

  expect(eventSource.url).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/ai-summary/stream',
  );
});

it('getArticleTasks GETs /api/articles/:id/tasks', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          fulltext: { type: 'fulltext', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
          ai_summary: { type: 'ai_summary', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
          ai_translate: { type: 'ai_translate', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);

  const { getArticleTasks } = await import('./apiClient');
  await getArticleTasks('00000000-0000-0000-0000-000000000000');

  const firstCall = fetchMock.mock.calls[0] ?? [];
  expect(getFetchCallUrl(firstCall[0])).toContain(
    '/api/articles/00000000-0000-0000-0000-000000000000/tasks',
  );
  expect(getFetchCallMethod(firstCall) ?? 'GET').toBe('GET');
});


it('requests feed keyword filter endpoints', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ ok: true, data: { keywords: ['Sponsored'] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const mod = await import('./apiClient');
  await mod.getFeedKeywordFilter('feed-1');
  await mod.patchFeedKeywordFilter('feed-1', { keywords: ['Sponsored'] });

  const getCall = fetchMock.mock.calls[0] ?? [];
  const patchCall = fetchMock.mock.calls[1] ?? [];

  expect(getFetchCallUrl(getCall[0])).toContain('/api/feeds/feed-1/keyword-filter');
  expect(getFetchCallMethod(getCall) ?? 'GET').toBe('GET');

  expect(getFetchCallUrl(patchCall[0])).toContain('/api/feeds/feed-1/keyword-filter');
  expect(getFetchCallMethod(patchCall)).toBe('PATCH');
});


describe('apiClient notification bridge', () => {
  it('notifies once for failing mutation requests by default', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'conflict', message: '订阅源已存在' },
        }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const notifier = await import('./apiErrorNotifier');
    const { createFeed } = await import('./apiClient');
    const notifyError = vi.fn();
    notifier.setApiErrorNotifier(notifyError);

    await expect(
      createFeed({ title: 'A', url: 'https://example.com/rss.xml' }),
    ).rejects.toMatchObject({
      code: 'conflict',
      message: '订阅源已存在',
    });
    expect(notifyError).toHaveBeenCalledWith('订阅源已存在');

    notifier.clearApiErrorNotifier();
  });

  it('keeps GET snapshot requests silent when notifyOnError is false', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'internal_error', message: '服务暂时不可用，请稍后重试' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const notifier = await import('./apiErrorNotifier');
    const { ApiError, getReaderSnapshot } = await import('./apiClient');
    const notifyError = vi.fn();
    notifier.setApiErrorNotifier(notifyError);

    await expect(
      getReaderSnapshot({ view: 'all' }, { notifyOnError: false }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(notifyError).not.toHaveBeenCalled();

    notifier.clearApiErrorNotifier();
  });
});
