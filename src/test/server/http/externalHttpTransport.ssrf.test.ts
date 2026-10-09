import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

import { lookup } from 'node:dns/promises';
import { fetchHtml, fetchImageStream, fetchRssXml } from '@/server/infra/http/externalHttpClient';
import { fetchTextWithValidatedRedirects } from '@/server/infra/http/fetchExternalText';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';

describe('external HTTP connection SSRF protection', () => {
  const lookupMock = vi.mocked(lookup);
  let server: Server;
  let url: string;
  let hits: string[];
  let hosts: (string | undefined)[];

  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('RSS_NETWORK_MODE', 'public');
    lookupMock.mockReset();
    hits = [];
    hosts = [];
    server = createServer((req, res) => {
      hits.push(req.url ?? '');
      hosts.push(req.headers.host);
      if (req.url === '/redirect') {
        res.writeHead(302, { location: url.replace('localhost', 'rebound.test') });
        res.end();
        return;
      }
      res.setHeader('content-type', 'image/png');
      res.end('<rss><channel><title>Feed</title></channel></rss>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://localhost:${(server.address() as AddressInfo).port}/feed`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    vi.unstubAllEnvs();
  });

  it.each(['rss', 'html', 'image'] as const)(
    'blocks DNS changing from public to loopback before the %s connection', async (kind) => {
      // URL 预检返回公网 IP，连接时变成回环；本地服务器收到请求即证明发生绕过。
      lookupMock.mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }]);
      lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
      const options = { timeoutMs: 1000, userAgent: 'test-agent' };
      if (kind === 'rss') {
        await expect(fetchRssXml(url, options)).rejects.toThrow('Unsafe URL');
      } else if (kind === 'html') {
        await expect(fetchHtml(url, { ...options, maxBytes: 1024 })).rejects.toThrow('Unsafe URL');
      } else {
        await expect(fetchImageStream(url, { ...options, maxRedirects: 5 })).resolves.toEqual({ kind: 'bad_gateway' });
      }
      expect(hits).toEqual([]);
      expect(lookupMock).toHaveBeenCalledTimes(2);
    },
  );

  it('rejects a mixed public/private DNS answer at connection time', async () => {
    lookupMock.mockResolvedValue([
      { address: '1.1.1.1', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(fetchTextWithValidatedRedirects(url, {
      timeoutMs: 1000, headers: {}, maxBytes: 1024, maxRedirects: 5,
      isSafeUrl: () => true,
    })).rejects.toThrow('Unsafe URL');
    expect(hits).toEqual([]);
  });

  it('checks DNS at connection time even when unresolved-host fallback passes preflight', async () => {
    url = url.replace('localhost', 'feeds.example.org');
    lookupMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(fetchTextWithValidatedRedirects(url, {
      timeoutMs: 1000, headers: {}, maxBytes: 1024, maxRedirects: 5,
      isSafeUrl: (target) => isSafeExternalUrl(target, { allowUnresolvedHostname: true }),
    })).rejects.toThrow('Unsafe URL');
    expect(hits).toEqual([]);
  });

  it('keeps administrator-approved connections working and preserves the Host header', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.1/32');
    lookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const result = await fetchRssXml(url, { timeoutMs: 1000, userAgent: 'test-agent' });
    expect(result.status).toBe(200);
    expect(hits).toEqual(['/feed']);
    expect(hosts).toEqual([new URL(url).host]);
  });

  it('revalidates DNS for a redirected connection', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.1/32');
    lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    lookupMock.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    lookupMock.mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }]);
    lookupMock.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
    await expect(fetchRssXml(url.replace('/feed', '/redirect'), {
      timeoutMs: 1000, userAgent: 'test-agent',
    })).rejects.toThrow('Unsafe URL');
    expect(hits).toEqual(['/redirect']);
    expect(lookupMock).toHaveBeenCalledTimes(4);
  });
});
