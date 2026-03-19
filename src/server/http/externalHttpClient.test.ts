import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const pool = {};
const writeSystemLogMock = vi.hoisted(() => vi.fn());

vi.mock('../db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('externalHttpClient', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    writeSystemLogMock.mockReset();

    const server = createServer((req, res) => {
      if (req.url === '/rss.xml') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.setHeader('etag', 'W/"1"');
        res.setHeader('last-modified', 'Mon, 01 Jan 2024 00:00:00 GMT');
        res.end('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>');
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
  });

  it('fetchRssXml returns status/xml/etag/lastModified and logs success metadata', async () => {
    const { fetchRssXml } = await import('./externalHttpClient');
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
    const { fetchRssXml } = await import('./externalHttpClient');
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
});
