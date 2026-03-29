import { beforeEach, describe, expect, it, vi } from 'vitest';
import { discoverFeedFavicon, extractFeedFaviconCandidates } from './discoverFeedFavicon';

const fetchHtmlMock = vi.fn();
const fetchImageStreamMock = vi.fn();

vi.mock('../http/externalHttpClient', () => ({
  fetchHtml: (...args: unknown[]) => fetchHtmlMock(...args),
  fetchImageStream: (...args: unknown[]) => fetchImageStreamMock(...args),
}));

function createImageStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

describe('extractFeedFaviconCandidates', () => {
  it('extracts and resolves favicon links from html', () => {
    const html = `
      <html>
        <head>
          <link rel="icon" href="/favicon-32.png" />
          <link rel="apple-touch-icon" href="https://cdn.example.com/apple-touch.png" />
        </head>
      </html>
    `;

    expect(extractFeedFaviconCandidates(html, 'https://example.com/blog')).toEqual([
      'https://example.com/favicon-32.png',
      'https://cdn.example.com/apple-touch.png',
    ]);
  });
});

describe('discoverFeedFavicon', () => {
  beforeEach(() => {
    fetchHtmlMock.mockReset();
    fetchImageStreamMock.mockReset();
  });

  it('falls back to /favicon.ico when the site html has no icon links', async () => {
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/blog',
      contentType: 'text/html',
      html: '<html><head></head><body>Hello</body></html>',
    });
    fetchImageStreamMock.mockResolvedValue({
      kind: 'ok',
      status: 200,
      contentType: 'image/png',
      cacheControl: 'public, max-age=3600',
      contentEncoding: null,
      contentLength: null,
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
      body: createImageStream(['png-data']),
    });

    const result = await discoverFeedFavicon('https://example.com/blog');

    expect(fetchImageStreamMock).toHaveBeenCalledWith(
      'https://example.com/favicon.ico',
      expect.objectContaining({
        maxRedirects: 3,
      }),
    );
    expect(result).toEqual({
      sourceUrl: 'https://example.com/favicon.ico',
      contentType: 'image/png',
      body: Buffer.from('png-data'),
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
    });
  });

  it('tries html-declared icon candidates before the favicon.ico fallback', async () => {
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/app',
      contentType: 'text/html',
      html: '<link rel="icon" href="/assets/favicon.svg" />',
    });
    fetchImageStreamMock
      .mockResolvedValueOnce({
        kind: 'ok',
        status: 404,
        contentType: 'image/svg+xml',
        cacheControl: 'public, max-age=3600',
        contentEncoding: null,
        contentLength: null,
        etag: null,
        lastModified: null,
        body: createImageStream(['missing']),
      })
      .mockResolvedValueOnce({
        kind: 'ok',
        status: 200,
        contentType: 'image/x-icon',
        cacheControl: 'public, max-age=3600',
        contentEncoding: null,
        contentLength: null,
        etag: null,
        lastModified: null,
        body: createImageStream(['ico-data']),
      });

    const result = await discoverFeedFavicon('https://example.com/app');

    expect(fetchImageStreamMock.mock.calls[0]?.[0]).toBe('https://example.com/assets/favicon.svg');
    expect(fetchImageStreamMock.mock.calls[1]?.[0]).toBe('https://example.com/favicon.ico');
    expect(result?.sourceUrl).toBe('https://example.com/favicon.ico');
    expect(result?.contentType).toBe('image/x-icon');
  });
});
