import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

describe('externalHttpClient (test harness)', () => {
  let closeServer: (() => Promise<void>) | null = null;
  let baseUrl = '';

  beforeEach(async () => {
    const server = createServer((req, res) => {
      if (req.url === '/rss.xml') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/rss+xml; charset=utf-8');
        res.setHeader('etag', 'W/"1"');
        res.setHeader('last-modified', 'Mon, 01 Jan 2024 00:00:00 GMT');
        res.end(
          '<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>',
        );
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

  it('boots local server and can import externalHttpClient', async () => {
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    // 暂时仅验证模块可被 import（不关心导出内容）
    await import('./externalHttpClient');
  });

  it('fetchRssXml returns status/xml/etag/lastModified', async () => {
    const { fetchRssXml } = await import('./externalHttpClient');

    const xmlUrl = `${baseUrl}/rss.xml`;

    const res = await fetchRssXml(xmlUrl, {
      timeoutMs: 1000,
      userAgent: 'test-agent',
      etag: null,
      lastModified: null,
    });

    expect(res.status).toBe(200);
    expect(res.xml).toContain('<rss');
    expect(res.etag).toBe('W/"1"');
    expect(res.lastModified).toBe('Mon, 01 Jan 2024 00:00:00 GMT');
  });
});
