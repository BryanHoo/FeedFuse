import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseStringMock = vi.fn();
const isSafeExternalUrlMock = vi.fn();
const getExternalUrlSafetyMock = vi.fn();
const fetchRssXmlMock = vi.fn();

vi.mock('rss-parser', () => {
  class MockParser {
    parseString = parseStringMock;
  }

  return {
    default: MockParser,
  };
});

vi.mock('@/server/integrations/rss/ssrfGuard', () => ({
  formatExternalUrlSafetyMessage: (
    safety: { reason: string; address?: string; mode?: string },
    target: 'source' | 'redirect',
  ) => {
    if (safety.reason === 'fake_ip') {
      return `当前 DNS 将域名解析到 fake-ip 地址 ${safety.address}，但 RSS_NETWORK_MODE 仍是 ${safety.mode}。请改为 RSS_NETWORK_MODE=fake-ip 后重试。`;
    }
    if (safety.reason === 'private_ip' && target === 'redirect') {
      return `RSS 源重定向后的地址解析到内网地址 ${safety.address}，当前 RSS_NETWORK_MODE=${safety.mode} 不允许访问内网源。`;
    }
    return '当前网络环境不允许访问该链接';
  },
  getExternalUrlSafety: (...args: unknown[]) => getExternalUrlSafetyMock(...args),
  isSafeExternalUrl: (...args: unknown[]) => isSafeExternalUrlMock(...args),
}));

vi.mock('@/server/infra/http/externalHttpClient', () => ({
  fetchRssXml: (...args: unknown[]) => fetchRssXmlMock(...args),
}));

describe('/api/rss/validate', () => {
  beforeEach(() => {
    parseStringMock.mockReset();
    isSafeExternalUrlMock.mockReset();
    getExternalUrlSafetyMock.mockReset();
    fetchRssXmlMock.mockReset();
    vi.restoreAllMocks();
    isSafeExternalUrlMock.mockResolvedValue(true);
    getExternalUrlSafetyMock.mockResolvedValue({ safe: true });
  });

  it('reports an upstream challenge as access_blocked rather than not_feed', async () => {
    const error = new Error('源站返回了安全验证页面，暂时无法获取订阅内容');
    error.name = 'FeedAccessBlockedError';
    fetchRssXmlMock.mockRejectedValue(error);
    const { GET } = await import('../../../../../app/api/rss/validate/route');
    const response = await GET(new Request('http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Ffeed'));
    expect((await response.json()).data).toEqual({
      valid: false,
      reason: 'access_blocked',
      message: error.message,
    });
    expect(parseStringMock).not.toHaveBeenCalled();
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

    const mod = await import('../../../../../app/api/rss/validate/route');
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
    expect(getExternalUrlSafetyMock).toHaveBeenCalledWith('https://example.com/rss.xml', {
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

    const mod = await import('../../../../../app/api/rss/validate/route');
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

    const mod = await import('../../../../../app/api/rss/validate/route');
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

    const mod = await import('../../../../../app/api/rss/validate/route');
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

  it('returns unsafe_url when rss guard blocks the link', async () => {
    getExternalUrlSafetyMock.mockResolvedValue({
      safe: false,
      reason: 'fake_ip',
      address: '198.18.0.69',
      mode: 'public',
    });

    const mod = await import('../../../../../app/api/rss/validate/route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Frss.xml',
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        valid: false,
        reason: 'unsafe_url',
        message:
          '当前 DNS 将域名解析到 fake-ip 地址 198.18.0.69，但 RSS_NETWORK_MODE 仍是 public。请改为 RSS_NETWORK_MODE=fake-ip 后重试。',
      },
    });
  });

  it('returns unsafe_url when redirected finalUrl is blocked by rss guard', async () => {
    getExternalUrlSafetyMock
      .mockResolvedValueOnce({ safe: true })
      .mockResolvedValueOnce({
        safe: false,
        reason: 'private_ip',
        address: '192.168.1.10',
        mode: 'public',
      });
    fetchRssXmlMock.mockResolvedValue({
      status: 200,
      xml: '<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>',
      etag: null,
      lastModified: null,
      finalUrl: 'http://192.168.1.10/rss.xml',
    });

    const mod = await import('../../../../../app/api/rss/validate/route');
    const response = await mod.GET(
      new Request(
        'http://localhost/api/rss/validate?url=https%3A%2F%2Fexample.com%2Frss.xml',
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        valid: false,
        reason: 'unsafe_url',
        message:
          'RSS 源重定向后的地址解析到内网地址 192.168.1.10，当前 RSS_NETWORK_MODE=public 不允许访问内网源。',
      },
    });
    expect(getExternalUrlSafetyMock).toHaveBeenNthCalledWith(1, 'https://example.com/rss.xml', {
      allowUnresolvedHostname: true,
    });
    expect(getExternalUrlSafetyMock).toHaveBeenNthCalledWith(2, 'http://192.168.1.10/rss.xml', {
      allowUnresolvedHostname: true,
    });
  });
});
