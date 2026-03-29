import { beforeEach, describe, expect, it, vi } from 'vitest';

const getOrFetchFeedFaviconMock = vi.fn();

vi.mock('@/server/auth/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../../../server/db/pool', () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock('../../../../../server/services/feedFaviconService', () => ({
  getOrFetchFeedFavicon: (...args: unknown[]) => getOrFetchFeedFaviconMock(...args),
}));

describe('/api/feeds/[id]/favicon', () => {
  beforeEach(() => {
    getOrFetchFeedFaviconMock.mockReset();
  });

  it('returns 400 for invalid feed ids', async () => {
    const mod = await import('./route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/not-a-number/favicon'), {
      params: Promise.resolve({ id: 'not-a-number' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the feed favicon cannot be resolved', async () => {
    getOrFetchFeedFaviconMock.mockResolvedValue(null);

    const mod = await import('./route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
  });

  it('returns cached favicon bytes with cache headers', async () => {
    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/png',
      body: Buffer.from('icon-bytes'),
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('etag')).toBe('"favicon-etag"');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from('icon-bytes'));
  });

  it('returns 304 when the client already has the latest etag', async () => {
    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/png',
      body: Buffer.from('icon-bytes'),
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/feeds/1001/favicon', {
        headers: { 'if-none-match': '"favicon-etag"' },
      }),
      {
        params: Promise.resolve({ id: '1001' }),
      },
    );

    expect(res.status).toBe(304);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
  });
});
