import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseStringMock = vi.fn();
const isSafeExternalUrlMock = vi.fn();
const fetchRssXmlMock = vi.fn();

vi.mock('rss-parser', () => {
  class MockParser {
    parseString = parseStringMock;
  }

  return {
    default: MockParser,
  };
});

vi.mock('../../../../server/rss/ssrfGuard', () => ({
  isSafeExternalUrl: (...args: unknown[]) => isSafeExternalUrlMock(...args),
}));

vi.mock('../../../../server/http/externalHttpClient', () => ({
  fetchRssXml: (...args: unknown[]) => fetchRssXmlMock(...args),
}));

describe('/api/rss/validate', () => {
  beforeEach(() => {
    parseStringMock.mockReset();
    isSafeExternalUrlMock.mockReset();
    fetchRssXmlMock.mockReset();
    vi.restoreAllMocks();
    isSafeExternalUrlMock.mockResolvedValue(true);
  });

  it('returns siteUrl from parsed feed.link when validation succeeds', async () => {
    parseStringMock.mockResolvedValue({ title: 'Feed', link: 'https://example.com/' });
    fetchRssXmlMock.mockResolvedValue({
      status: 200,
      xml: '<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>',
      etag: null,
      lastModified: null,
      finalUrl: 'https://example.com/rss.xml',
    });

    const mod = await import('./route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Frss.xml',
      ),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({
      valid: true,
      siteUrl: 'https://example.com/',
    });
    expect(isSafeExternalUrlMock).toHaveBeenCalledWith('https://example.com/rss.xml', {
      allowUnresolvedHostname: true,
    });
  });

  it('returns success without siteUrl when feed.link missing', async () => {
    parseStringMock.mockResolvedValue({ title: 'Feed' });
    fetchRssXmlMock.mockResolvedValue({
      status: 200,
      xml: '<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>',
      etag: null,
      lastModified: null,
      finalUrl: 'https://example.com/rss.xml',
    });

    const mod = await import('./route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Frss.xml',
      ),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data).toMatchObject({ valid: true });
    expect(json.data.siteUrl).toBeUndefined();
  });

  it('returns unified success envelope for invalid feeds', async () => {
    parseStringMock.mockRejectedValue(new Error('not a feed'));
    fetchRssXmlMock.mockResolvedValue({
      status: 200,
      xml: '<html>not rss</html>',
      etag: null,
      lastModified: null,
      finalUrl: 'https://example.com/invalid.xml',
    });

    const mod = await import('./route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Finvalid.xml',
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        valid: false,
        reason: 'not_feed',
        message: '响应不是合法的 RSS/Atom 源',
      },
    });
  });

  it('returns dns_error when upstream hostname cannot be resolved', async () => {
    const dnsError = Object.assign(new Error('getaddrinfo ENOTFOUND www.ruanyifeng.com'), {
      code: 'ENOTFOUND',
    });
    fetchRssXmlMock.mockRejectedValue(dnsError);

    const mod = await import('./route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fwww.ruanyifeng.com%2Fblog%2Fatom.xml',
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        valid: false,
        reason: 'dns_error',
        message: '域名无法解析，请检查网络或 DNS 设置',
      },
    });
  });
});
