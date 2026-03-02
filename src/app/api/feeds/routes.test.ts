import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {
  query: vi.fn(),
};

const listFeedsMock = vi.fn();
const createFeedMock = vi.fn();
const updateFeedMock = vi.fn();
const deleteFeedMock = vi.fn();

const enqueueMock = vi.fn();

vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../server/repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
  createFeed: (...args: unknown[]) => createFeedMock(...args),
  updateFeed: (...args: unknown[]) => updateFeedMock(...args),
  deleteFeed: (...args: unknown[]) => deleteFeedMock(...args),
}));
vi.mock('../../../../server/repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
  createFeed: (...args: unknown[]) => createFeedMock(...args),
  updateFeed: (...args: unknown[]) => updateFeedMock(...args),
  deleteFeed: (...args: unknown[]) => deleteFeedMock(...args),
}));

vi.mock('../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}));
vi.mock('../../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}));
vi.mock('../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}));

const feedId = '00000000-0000-0000-0000-000000000000';
const categoryId = '22222222-2222-2222-8222-222222222222';

describe('/api/feeds', () => {
  beforeEach(() => {
    pool.query.mockReset();
    listFeedsMock.mockReset();
    createFeedMock.mockReset();
    updateFeedMock.mockReset();
    deleteFeedMock.mockReset();
    enqueueMock.mockReset();
  });

  it('GET returns feeds with unreadCount', async () => {
    listFeedsMock.mockResolvedValue([
      {
        id: feedId,
        title: 'Example',
        url: 'https://example.com/rss.xml',
        siteUrl: null,
        iconUrl: null,
        enabled: true,
        fullTextOnOpenEnabled: false,
        aiSummaryOnOpenEnabled: false,
        categoryId: null,
        fetchIntervalMinutes: 30,
      },
    ]);

    pool.query.mockResolvedValue({
      rows: [{ feedId, unreadCount: 3 }],
    });

    const mod = await import('./route');
    const res = await mod.GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data[0].unreadCount).toBe(3);
  });

  it('POST creates a feed', async () => {
    createFeedMock.mockResolvedValue({
      id: feedId,
      title: 'Example',
      url: 'https://1.1.1.1/rss.xml',
      siteUrl: null,
      iconUrl: null,
      enabled: true,
      fullTextOnOpenEnabled: true,
      aiSummaryOnOpenEnabled: true,
      categoryId,
      fetchIntervalMinutes: 30,
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Example',
          url: 'https://1.1.1.1/rss.xml',
          categoryId,
          fullTextOnOpenEnabled: true,
          aiSummaryOnOpenEnabled: true,
        }),
      }),
    );
    const json = await res.json();

    expect(createFeedMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ fullTextOnOpenEnabled: true, aiSummaryOnOpenEnabled: true }),
    );
    expect(json.ok).toBe(true);
    expect(json.data.url).toBe('https://1.1.1.1/rss.xml');
  });

  it('POST /api/feeds forwards siteUrl and derived iconUrl', async () => {
    createFeedMock.mockResolvedValue({
      id: feedId,
      title: 'Example',
      url: 'https://1.1.1.1/rss.xml',
      siteUrl: 'https://example.com/',
      iconUrl:
        'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.com',
      enabled: true,
      fullTextOnOpenEnabled: false,
      aiSummaryOnOpenEnabled: false,
      categoryId: null,
      fetchIntervalMinutes: 30,
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Example',
          url: 'https://1.1.1.1/rss.xml',
          siteUrl: 'https://example.com/',
        }),
      }),
    );
    const json = await res.json();

    expect(createFeedMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        siteUrl: 'https://example.com/',
        iconUrl:
          'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.com',
      }),
    );
    expect(json.ok).toBe(true);
  });

  it('POST validates and rejects unsafe urls', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Example',
          url: 'http://192.168.1.1/rss.xml',
        }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.url).toBeTruthy();
  });

  it('POST returns conflict on duplicate url', async () => {
    createFeedMock.mockRejectedValue({
      code: '23505',
      constraint: 'feeds_url_unique',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Example',
          url: 'https://1.1.1.1/rss.xml',
        }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('conflict');
  });

  it('POST returns validation error when categoryId does not exist', async () => {
    createFeedMock.mockRejectedValue({
      code: '23503',
      constraint: 'feeds_category_id_fkey',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/feeds', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Example',
          url: 'https://1.1.1.1/rss.xml',
          categoryId: '11111111-1111-4111-8111-111111111111',
        }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.categoryId).toBeTruthy();
  });

  it('PATCH updates a feed', async () => {
    updateFeedMock.mockResolvedValue({
      id: feedId,
      title: 'Updated',
      url: 'https://example.com/rss.xml',
      siteUrl: null,
      iconUrl: null,
      enabled: false,
      fullTextOnOpenEnabled: true,
      aiSummaryOnOpenEnabled: true,
      articleListDisplayMode: 'list',
      categoryId: null,
      fetchIntervalMinutes: 30,
    });

    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/feeds/${feedId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled: false,
          title: 'Updated',
          fullTextOnOpenEnabled: true,
          aiSummaryOnOpenEnabled: true,
          articleListDisplayMode: 'list',
        }),
      }),
      { params: Promise.resolve({ id: feedId }) },
    );
    const json = await res.json();

    expect(updateFeedMock).toHaveBeenCalledWith(
      pool,
      feedId,
      expect.objectContaining({
        fullTextOnOpenEnabled: true,
        aiSummaryOnOpenEnabled: true,
        articleListDisplayMode: 'list',
      }),
    );
    expect(json.ok).toBe(true);
    expect(json.data.enabled).toBe(false);
    expect(json.data.title).toBe('Updated');
  });

  it('PATCH /api/feeds/:id accepts url and siteUrl', async () => {
    updateFeedMock.mockResolvedValue({
      id: feedId,
      title: 'Updated',
      url: 'https://2.2.2.2/rss.xml',
      siteUrl: 'https://example.org/',
      iconUrl:
        'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.org',
      enabled: true,
      fullTextOnOpenEnabled: false,
      aiSummaryOnOpenEnabled: false,
      categoryId: null,
      fetchIntervalMinutes: 30,
    });

    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/feeds/${feedId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Updated',
          url: 'https://2.2.2.2/rss.xml',
          siteUrl: 'https://example.org/',
        }),
      }),
      { params: Promise.resolve({ id: feedId }) },
    );
    const json = await res.json();

    expect(updateFeedMock).toHaveBeenCalledWith(
      pool,
      feedId,
      expect.objectContaining({
        title: 'Updated',
        url: 'https://2.2.2.2/rss.xml',
        siteUrl: 'https://example.org/',
        iconUrl:
          'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Fexample.org',
      }),
    );
    expect(json.ok).toBe(true);
  });

  it('PATCH returns validation error when categoryId does not exist', async () => {
    updateFeedMock.mockRejectedValue({
      code: '23503',
      constraint: 'feeds_category_id_fkey',
    });

    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/feeds/${feedId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoryId: '22222222-2222-4222-8222-222222222222' }),
      }),
      { params: Promise.resolve({ id: feedId }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.categoryId).toBeTruthy();
  });

  it('DELETE deletes a feed', async () => {
    deleteFeedMock.mockResolvedValue(true);

    const mod = await import('./[id]/route');
    const res = await mod.DELETE(new Request(`http://localhost/api/feeds/${feedId}`), {
      params: Promise.resolve({ id: feedId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
  });

  it('POST /refresh enqueues feed.fetch', async () => {
    enqueueMock.mockResolvedValue('job-id-1');

    const mod = await import('./[id]/refresh/route');
    const res = await mod.POST(new Request(`http://localhost/api/feeds/${feedId}/refresh`), {
      params: Promise.resolve({ id: feedId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalled();
    expect(enqueueMock.mock.calls[0][0]).toBe('feed.fetch');
    expect(enqueueMock.mock.calls[0][1]).toEqual({ feedId, force: true });
  });

  it('POST /refresh (all) enqueues feed.refresh_all', async () => {
    enqueueMock.mockResolvedValue('job-id-1');

    const mod = await import('./refresh/route');
    const res = await mod.POST(new Request('http://localhost/api/feeds/refresh', { method: 'POST' }));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalled();
    expect(enqueueMock.mock.calls[0][0]).toBe('feed.refresh_all');
    expect(enqueueMock.mock.calls[0][1]).toEqual({ force: true });
  });
});
