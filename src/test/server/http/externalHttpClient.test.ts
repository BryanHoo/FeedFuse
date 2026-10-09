import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const pool = {};
const writeSystemLogMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/infra/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('externalHttpClient', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl = '';
  let privateRssHits = 0;
  let privateHtmlHits = 0;

  beforeEach(async () => {
    // 测试服务器使用回环地址，按生产规则显式授予管理员 CIDR 例外。
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.1/32');
    writeSystemLogMock.mockReset();
    privateRssHits = 0;
    privateHtmlHits = 0;

    const server = createServer((req, res) => {
      if (req.url === '/rss.xml') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.setHeader('etag', 'W/"1"');
        res.setHeader('last-modified', 'Mon, 01 Jan 2024 00:00:00 GMT');
        res.end('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>');
        return;
      }

      if (req.url === '/redirect-private.xml') {
        res.statusCode = 302;
        res.setHeader('location', `${baseUrl}/private.xml`);
        res.end();
        return;
      }

      if (req.url === '/private.xml') {
        privateRssHits += 1;
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.end('<?xml version="1.0"?><rss><channel><title>Private</title></channel></rss>');
        return;
      }

      if (req.url === '/redirect-private.html') {
        res.statusCode = 302;
        res.setHeader('location', `${baseUrl}/private.html`);
        res.end();
        return;
      }

      if (req.url === '/private.html') {
        privateHtmlHits += 1;
        res.statusCode = 200;
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<html><body>Private</body></html>');
        return;
      }

      if (req.url === '/large.xml') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.end(`<rss><channel><title>${'x'.repeat(1024)}</title></channel></rss>`);
        return;
      }

      if (req.url === '/large-error.txt') {
        res.statusCode = 500;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(`upstream-error:${'x'.repeat(5000)}`);
        return;
      }

      if (req.url === '/error.json') {
        res.statusCode = 429;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end('{"error":{"message":"Rate limit exceeded"}}');
        return;
      }

      res.statusCode = 200;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('ok');
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    closeServer = async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    };
  });

  afterEach(async () => {
    await closeServer?.();
    vi.unstubAllEnvs();
  });

  it('fetchRssXml returns status/xml/etag/lastModified and logs success metadata', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const xmlUrl = `${baseUrl}/rss.xml`;

    const res = await fetchRssXml(
      xmlUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        etag: null,
        lastModified: null,
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: xmlUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    expect(res.status).toBe(200);
    expect(res.xml).toContain('<rss');
    expect(res.etag).toBe('W/"1"');
    expect(res.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'info',
        category: 'external_api',
        source: 'server/rss/fetchFeedXml',
        message: 'RSS fetch completed',
        details: null,
        context: expect.objectContaining({
          url: xmlUrl,
          method: 'GET',
          status: 200,
          feedUrl: xmlUrl,
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('writes upstream JSON error payload as raw details text', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const errorUrl = `${baseUrl}/error.json`;

    const res = await fetchRssXml(
      errorUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        etag: null,
        lastModified: null,
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: errorUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    expect(res.status).toBe(429);
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'error',
        category: 'external_api',
        source: 'server/rss/fetchFeedXml',
        message: 'RSS fetch failed',
        details: '{"error":{"message":"Rate limit exceeded"}}',
        context: expect.objectContaining({
          url: errorUrl,
          method: 'GET',
          status: 429,
          feedUrl: errorUrl,
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('validates each RSS redirect hop before requesting the next URL', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const redirectUrl = `${baseUrl}/redirect-private.xml`;
    const privateUrl = `${baseUrl}/private.xml`;

    await expect(
      fetchRssXml(redirectUrl, {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        isSafeUrl: async (url: string) => url !== privateUrl,
      } as Parameters<typeof fetchRssXml>[1]),
    ).rejects.toThrow('Unsafe URL');
    expect(privateRssHits).toBe(0);
  });

  it('validates each HTML redirect hop before requesting the next URL', async () => {
    const { fetchHtml } = await import('@/server/infra/http/externalHttpClient');
    const redirectUrl = `${baseUrl}/redirect-private.html`;
    const privateUrl = `${baseUrl}/private.html`;

    await expect(
      fetchHtml(redirectUrl, {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        maxBytes: 1024,
        isSafeUrl: async (url: string) => url !== privateUrl,
      }),
    ).rejects.toThrow('Unsafe URL');
    expect(privateHtmlHits).toBe(0);
  });

  it('rejects RSS responses that exceed the configured byte limit', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const largeUrl = `${baseUrl}/large.xml`;

    await expect(
      fetchRssXml(largeUrl, {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        maxBytes: 128,
      } as Parameters<typeof fetchRssXml>[1]),
    ).rejects.toThrow('Response too large');
  });

  it('truncates oversized external error details before writing system logs', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const largeErrorUrl = `${baseUrl}/large-error.txt`;

    await fetchRssXml(
      largeErrorUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        logging: {
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: largeErrorUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    const details = writeSystemLogMock.mock.calls[0]?.[1]?.details;
    expect(typeof details).toBe('string');
    expect(details.length).toBeLessThan(5000);
    expect(details).toContain('[truncated]');
  });

  it('writes external request logs under the related user id', async () => {
    const { fetchRssXml } = await import('@/server/infra/http/externalHttpClient');
    const xmlUrl = `${baseUrl}/rss.xml`;

    await fetchRssXml(
      xmlUrl,
      {
        timeoutMs: 1000,
        userAgent: 'test-agent',
        logging: {
          userId: 'user-1',
          source: 'server/rss/fetchFeedXml',
          requestLabel: 'RSS fetch',
          context: { feedUrl: xmlUrl },
        },
      } as Parameters<typeof fetchRssXml>[1],
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        userId: 'user-1',
      }),
    );
  });
});
