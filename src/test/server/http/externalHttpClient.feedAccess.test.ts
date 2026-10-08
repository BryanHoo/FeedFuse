import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFeed } from '@/server/integrations/rss/parseFeed';

const streamMock = vi.hoisted(() => vi.fn());
vi.mock('got', () => ({ default: { extend: () => ({ stream: streamMock }) } }));

const feedXml = '<rss version="2.0"><channel><title>Feed</title>' +
  '<item><title>Article</title></item></channel></rss>';
const wafHtml = '<!DOCTYPE html><html><body>正在进行安全检测...' +
  '<script>document.cookie="_wafchallengeid=challenge"</script></body></html>';
type ResponseData = { status?: number; body: string; headers?: Record<string, string>; error?: Error };

function mockResponses(responses: Record<string, ResponseData>) {
  streamMock.mockImplementation((url: string) => {
    const stream = new PassThrough();
    queueMicrotask(() => {
      const response = responses[url] ?? { status: 404, body: 'not found' };
      if (response.error) {
        stream.destroy(response.error);
        return;
      }
      stream.emit('response', {
        statusCode: response.status ?? 200,
        url,
        headers: response.headers ?? {},
      });
      stream.end(response.body);
    });
    return stream;
  });
}

async function fetchFeed(url: string, options = {}) {
  const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
  return fetchRssXml(url, {
    timeoutMs: 1000,
    userAgent: 'FeedFuse',
    isSafeUrl: () => true,
    ...options,
  });
}

describe('RSS upstream access recovery', () => {
  beforeEach(() => streamMock.mockReset());

  it.each(['36kr.com', 'news.example.com'])('recovers challenge pages without a domain rule: %s', async (host) => {
    const url = `https://${host}/feed?limit=10`;
    const alternate = `https://www.${host}/feed?limit=10`;
    mockResponses({ [url]: { body: wafHtml }, [alternate]: { body: feedXml } });
    const result = await fetchFeed(url);
    expect(result.finalUrl).toBe(alternate);
    expect((await parseFeed(result.xml!, new Date())).items).toHaveLength(1);
    expect(streamMock.mock.calls.map(([target]) => target)).toEqual([url, alternate]);
  });

  it('also recovers from a challenge on the www endpoint', async () => {
    mockResponses({
      'https://www.example.com/feed': { body: wafHtml },
      'https://example.com/feed': { body: feedXml },
    });
    expect((await fetchFeed('https://www.example.com/feed')).finalUrl).toBe('https://example.com/feed');
  });

  it.each([403, 503])('recovers challenge pages returned with HTTP %s', async (status) => {
    mockResponses({
      'https://example.com/feed': { status, body: wafHtml },
      'https://www.example.com/feed': { body: feedXml },
    });
    expect((await fetchFeed('https://example.com/feed')).xml).toBe(feedXml);
  });

  it('reports access blocked after one unsuccessful alternate attempt', async () => {
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { body: wafHtml },
    });
    await expect(fetchFeed('https://example.com/feed')).rejects.toMatchObject({ name: 'FeedAccessBlockedError' });
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it('retains the blocked diagnosis when the alternate is an ordinary web page', async () => {
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { body: '<html><body>Home page</body></html>' },
    });
    await expect(fetchFeed('https://example.com/feed')).rejects.toMatchObject({ name: 'FeedAccessBlockedError' });
  });

  it('retains the original blocked diagnosis when the alternate cannot resolve', async () => {
    const error = Object.assign(new Error('getaddrinfo ENOTFOUND www.example.com'), { code: 'ENOTFOUND' });
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { body: '', error },
    });
    await expect(fetchFeed('https://example.com/feed')).rejects.toMatchObject({
      name: 'FeedAccessBlockedError', cause: error,
    });
  });

  it.each([
    '<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/script.js"></script></body></html>',
    '<html><body>Verify you are human</body></html>',
  ])('recognizes other challenge providers', async (body) => {
    mockResponses({
      'https://example.com/feed': { body },
      'https://www.example.com/feed': { body: feedXml },
    });
    expect((await fetchFeed('https://example.com/feed')).xml).toBe(feedXml);
  });

  it('checks alternate endpoint safety before requesting it', async () => {
    mockResponses({ 'https://example.com/feed': { body: wafHtml } });
    const isSafeUrl = vi.fn(async (url: string) => url === 'https://example.com/feed');
    await expect(fetchFeed('https://example.com/feed', { isSafeUrl })).rejects.toThrow('Unsafe URL');
    expect(isSafeUrl).toHaveBeenCalledWith('https://www.example.com/feed');
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it('checks each redirect from the alternate before accessing its target', async () => {
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { status: 302, body: '', headers: { location: 'http://10.0.0.1/feed' } },
    });
    const isSafeUrl = vi.fn(async (url: string) => !url.includes('10.0.0.1'));
    await expect(fetchFeed('https://example.com/feed', { isSafeUrl })).rejects.toThrow('Unsafe URL');
    expect(isSafeUrl).toHaveBeenCalledWith('http://10.0.0.1/feed');
    expect(streamMock).toHaveBeenCalledTimes(2);
  });

  it('preserves response size limits on the alternate', async () => {
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { body: feedXml + ' '.repeat(1024) },
    });
    await expect(fetchFeed('https://example.com/feed', { maxBytes: 512 })).rejects.toThrow('Response too large');
  });

  it.each([
    feedXml,
    '<html><body>Ordinary page</body></html>',
    '<rss version="2.0"><channel><title>WAF</title><description><![CDATA[' + wafHtml + ']]></description></channel></rss>',
  ])('preserves responses without an HTML challenge', async (body) => {
    mockResponses({ 'https://example.com/feed': { body } });
    expect((await fetchFeed('https://example.com/feed')).xml).toBe(body);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret a normal HTTP error as a challenge', async () => {
    mockResponses({ 'https://example.com/feed': { status: 403, body: 'Forbidden' } });
    expect((await fetchFeed('https://example.com/feed')).status).toBe(403);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it.each(['http://127.0.0.1/feed', 'http://localhost/feed', 'https://example.com:8443/feed'])('does not guess aliases for local or custom port endpoints: %s', async (url) => {
    mockResponses({ [url]: { body: wafHtml } });
    await expect(fetchFeed(url)).rejects.toMatchObject({ name: 'FeedAccessBlockedError' });
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it('keeps conditional headers on the original request and clears them on the alternate', async () => {
    mockResponses({
      'https://example.com/feed': { body: wafHtml },
      'https://www.example.com/feed': { body: feedXml },
    });
    await fetchFeed('https://example.com/feed', { etag: 'W/"old"', lastModified: 'Thu, 08 Oct 2026 00:00:00 GMT' });
    expect(streamMock.mock.calls[0][1].headers['if-none-match']).toBe('W/"old"');
    expect(streamMock.mock.calls[1][1].headers).not.toHaveProperty('if-none-match');
    expect(streamMock.mock.calls[1][1].headers).not.toHaveProperty('if-modified-since');
  });

  it('preserves normal 304 responses without alias retries', async () => {
    mockResponses({ 'https://example.com/feed': { status: 304, body: '' } });
    expect((await fetchFeed('https://example.com/feed')).xml).toBeNull();
    expect(streamMock).toHaveBeenCalledTimes(1);
  });
});
