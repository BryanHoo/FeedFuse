import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRssXmlMock = vi.hoisted(() => vi.fn());

vi.mock('../http/externalHttpClient', () => ({
  fetchRssXml: (...args: unknown[]) => fetchRssXmlMock(...args),
}));

describe('fetchFeedXml', () => {
  beforeEach(() => {
    fetchRssXmlMock.mockReset();
  });

  it('passes RSS logging metadata into fetchRssXml', async () => {
    fetchRssXmlMock.mockResolvedValue({
      status: 200,
      xml: '<rss />',
      etag: null,
      lastModified: null,
      finalUrl: 'https://example.com/feed.xml',
    });

    const mod = await import('./fetchFeedXml');
    await mod.fetchFeedXml('https://example.com/feed.xml', {
      timeoutMs: 1000,
      userAgent: 'test-agent',
    });

    expect(fetchRssXmlMock).toHaveBeenCalledWith(
      'https://example.com/feed.xml',
      expect.objectContaining({
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: {
            feedUrl: 'https://example.com/feed.xml',
          },
        },
      }),
    );
  });
});
