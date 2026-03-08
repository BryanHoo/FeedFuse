import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildImageProxyUrl } from '../../../../server/media/imageProxyUrl';

const fetchMock = vi.fn();

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

vi.stubGlobal('fetch', fetchMock);

import { lookup } from 'node:dns/promises';

describe('/api/media/image', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    fetchMock.mockReset();
    lookupMock.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');
  });

  it('proxies image bytes for a valid signed request', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
          'cache-control': 'public, max-age=600',
        },
      }),
    );

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/a.jpg',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('rejects an invalid signature', async () => {
    const mod = await import('./route');
    const res = await mod.GET(
      new Request(
        'http://localhost/api/media/image?url=https%3A%2F%2Fimg.example.com%2Fa.jpg&sig=bad',
      ),
    );

    expect(res.status).toBe(403);
  });

  it('rejects non-image upstream responses', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response('<html>blocked</html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/not-image',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(415);
  });

  it('rejects redirects that end at private targets', async () => {
    lookupMock.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.jpg' },
      }),
    );

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/redirect.jpg',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(403);
  });
});
