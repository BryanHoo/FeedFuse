import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrFetchFeedFavicon } from './feedFaviconService';

const getFeedFaviconCacheMock = vi.fn();
const upsertFeedFaviconCacheMock = vi.fn();
const upsertFeedFaviconFailureMock = vi.fn();
const getFeedFaviconTargetMock = vi.fn();
const discoverFeedFaviconMock = vi.fn();

vi.mock('../repositories/feedFaviconsRepo', () => ({
  getFeedFaviconCache: (...args: unknown[]) => getFeedFaviconCacheMock(...args),
  upsertFeedFaviconCache: (...args: unknown[]) => upsertFeedFaviconCacheMock(...args),
  upsertFeedFaviconFailure: (...args: unknown[]) => upsertFeedFaviconFailureMock(...args),
}));

vi.mock('../repositories/feedsRepo', () => ({
  getFeedFaviconTarget: (...args: unknown[]) => getFeedFaviconTargetMock(...args),
}));

vi.mock('../rss/discoverFeedFavicon', () => ({
  discoverFeedFavicon: (...args: unknown[]) => discoverFeedFaviconMock(...args),
}));

describe('feedFaviconService', () => {
  const pool = {} as Pool;

  beforeEach(() => {
    getFeedFaviconCacheMock.mockReset();
    upsertFeedFaviconCacheMock.mockReset();
    upsertFeedFaviconFailureMock.mockReset();
    getFeedFaviconTargetMock.mockReset();
    discoverFeedFaviconMock.mockReset();
  });

  it('returns cached favicon assets without refetching', async () => {
    getFeedFaviconCacheMock.mockResolvedValue({
      feedId: 'feed-1',
      fetchStatus: 'ready',
      sourceUrl: 'https://example.com/favicon.ico',
      contentType: 'image/png',
      body: Buffer.from('cached'),
      etag: null,
      lastModified: null,
      failureReason: null,
      nextRetryAt: null,
      fetchedAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const asset = await getOrFetchFeedFavicon(pool, 'feed-1');

    expect(discoverFeedFaviconMock).not.toHaveBeenCalled();
    expect(asset?.contentType).toBe('image/png');
    expect(asset?.body).toEqual(Buffer.from('cached'));
    expect(asset?.etag).toContain('feed-favicon-feed-1');
  });

  it('discovers and stores a favicon when the cache is cold', async () => {
    getFeedFaviconCacheMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        feedId: 'feed-1',
        fetchStatus: 'ready',
        sourceUrl: 'https://example.com/favicon.ico',
        contentType: 'image/png',
        body: Buffer.from('fresh'),
        etag: '"upstream-etag"',
        lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
        failureReason: null,
        nextRetryAt: null,
        fetchedAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
      });
    getFeedFaviconTargetMock.mockResolvedValue({
      id: 'feed-1',
      kind: 'rss',
      siteUrl: 'https://example.com',
      iconUrl: '/api/feeds/feed-1/favicon',
    });
    discoverFeedFaviconMock.mockResolvedValue({
      sourceUrl: 'https://example.com/favicon.ico',
      contentType: 'image/png',
      body: Buffer.from('fresh'),
      etag: '"upstream-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
    });

    const asset = await getOrFetchFeedFavicon(pool, 'feed-1');

    expect(discoverFeedFaviconMock).toHaveBeenCalledWith('https://example.com');
    expect(upsertFeedFaviconCacheMock).toHaveBeenCalledWith(pool, {
      feedId: 'feed-1',
      sourceUrl: 'https://example.com/favicon.ico',
      contentType: 'image/png',
      body: Buffer.from('fresh'),
      etag: '"upstream-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
    });
    expect(asset?.etag).toBe('"upstream-etag"');
  });

  it('does not refetch while a failed favicon cache entry is still within the retry window', async () => {
    getFeedFaviconCacheMock.mockResolvedValue({
      feedId: 'feed-1',
      fetchStatus: 'failed',
      sourceUrl: null,
      contentType: null,
      body: null,
      etag: null,
      lastModified: null,
      failureReason: 'favicon_not_found',
      nextRetryAt: '2099-03-29T00:00:00.000Z',
      fetchedAt: '2026-03-29T00:00:00.000Z',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const asset = await getOrFetchFeedFavicon(pool, 'feed-1');

    expect(asset).toBeNull();
    expect(getFeedFaviconTargetMock).not.toHaveBeenCalled();
    expect(discoverFeedFaviconMock).not.toHaveBeenCalled();
  });

  it('records a negative cache entry when favicon discovery fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T00:00:00.000Z'));

    getFeedFaviconCacheMock.mockResolvedValue(null);
    getFeedFaviconTargetMock.mockResolvedValue({
      id: 'feed-1',
      kind: 'rss',
      siteUrl: 'https://example.com',
      iconUrl: '/api/feeds/feed-1/favicon',
    });
    discoverFeedFaviconMock.mockResolvedValue(null);

    const asset = await getOrFetchFeedFavicon(pool, 'feed-1');

    expect(asset).toBeNull();
    expect(upsertFeedFaviconFailureMock).toHaveBeenCalledWith(pool, {
      feedId: 'feed-1',
      failureReason: 'favicon_not_found',
      nextRetryAt: '2026-03-29T06:00:00.000Z',
    });

    vi.useRealTimers();
  });
});
