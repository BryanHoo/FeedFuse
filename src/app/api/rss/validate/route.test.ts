import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseStringMock = vi.fn();
const isSafeExternalUrlMock = vi.fn();

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

describe('/api/rss/validate', () => {
  beforeEach(() => {
    parseStringMock.mockReset();
    isSafeExternalUrlMock.mockReset();
    vi.restoreAllMocks();
    isSafeExternalUrlMock.mockResolvedValue(true);
  });

  it('returns siteUrl from parsed feed.link when validation succeeds', async () => {
    parseStringMock.mockResolvedValue({ title: 'Feed', link: 'https://example.com/' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>', {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }),
    );

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
  });

  it('returns success without siteUrl when feed.link missing', async () => {
    parseStringMock.mockResolvedValue({ title: 'Feed' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<?xml version="1.0"?><rss><channel><title>Feed</title></channel></rss>', {
        status: 200,
        headers: { 'content-type': 'application/rss+xml' },
      }),
    );

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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>not rss</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    );

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
});
