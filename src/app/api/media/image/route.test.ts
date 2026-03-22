import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { buildImageProxyUrl } from '../../../../server/media/imageProxyUrl';

const fetchImageStreamMock = vi.fn();

function streamFromBytes(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

vi.mock('../../../../server/http/externalHttpClient', () => ({
  fetchImageStream: (...args: unknown[]) => fetchImageStreamMock(...args),
}));

describe('/api/media/image', () => {
  beforeEach(() => {
    fetchImageStreamMock.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');
  });

  it('proxies image bytes for a valid signed request', async () => {
    const sourceBytes = Uint8Array.from([1, 2, 3]);
    fetchImageStreamMock.mockResolvedValue({
      kind: 'ok',
      status: 200,
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=600',
      body: streamFromBytes(sourceBytes),
    });

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/a.jpg',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(Buffer.from(sourceBytes));
  });

  it('proxies upstream error responses instead of redirecting to the source image', async () => {
    fetchImageStreamMock.mockResolvedValue({
      kind: 'ok',
      status: 429,
      contentType: 'text/plain; charset=utf-8',
      cacheControl: 'no-store',
      body: streamFromBytes(new TextEncoder().encode('rate limited')),
    });

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/rate-limited.jpg',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(429);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toBe('rate limited');
  });

  it('rejects an invalid signature', async () => {
    const mod = await import('./route');
    const res = await mod.GET(
      new Request(
        'http://localhost/api/media/image?url=https%3A%2F%2Fimg.example.com%2Fa.jpg&sig=bad',
      ),
    );

    expect(res.status).toBe(403);
    expect(fetchImageStreamMock).not.toHaveBeenCalled();
  });

  it('rejects non-image upstream responses', async () => {
    fetchImageStreamMock.mockResolvedValue({ kind: 'unsupported_media_type' });

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/not-image',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(415);
  });

  it('rejects redirects that end at private targets', async () => {
    fetchImageStreamMock.mockResolvedValue({ kind: 'forbidden' });

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/redirect.jpg',
      secret: 'test-image-proxy-secret',
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));

    expect(res.status).toBe(403);
  });

  it('passes through signed preview image requests without resizing or recompression', async () => {
    const sourceImage = await sharp({
      create: {
        width: 800,
        height: 600,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    fetchImageStreamMock.mockResolvedValue({
      kind: 'ok',
      status: 200,
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=600',
      body: streamFromBytes(Uint8Array.from(sourceImage)),
    });

    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/a.jpg',
      secret: 'test-image-proxy-secret',
      width: 192,
      height: 208,
      quality: 55,
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request(`http://localhost${proxied}`));
    const proxiedBytes = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(proxiedBytes).toEqual(sourceImage);
  });
});
