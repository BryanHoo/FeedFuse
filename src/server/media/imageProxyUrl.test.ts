import { describe, expect, it } from 'vitest';
import {
  buildImageProxyUrl,
  getImageProxySecret,
  hasValidImageProxySignature,
} from './imageProxyUrl';

describe('imageProxyUrl', () => {
  it('builds a signed proxy url and rejects tampering', () => {
    const secret = 'test-image-proxy-secret';
    const proxied = buildImageProxyUrl({
      sourceUrl: 'https://img.example.com/a.jpg',
      secret,
      width: 192,
      height: 208,
      quality: 55,
    });

    expect(proxied).toMatch(/^\/api\/media\/image\?/);

    const parsed = new URL(`http://localhost${proxied}`);
    const signedUrl = parsed.searchParams.get('url');
    const width = parsed.searchParams.get('w');
    const height = parsed.searchParams.get('h');
    const quality = parsed.searchParams.get('q');
    const sig = parsed.searchParams.get('sig');

    expect(signedUrl).toBe('https://img.example.com/a.jpg');
    expect(width).toBe('192');
    expect(height).toBe('208');
    expect(quality).toBe('55');
    expect(sig).toBeTruthy();
    expect(
      hasValidImageProxySignature({
        sourceUrl: signedUrl!,
        width: 192,
        height: 208,
        quality: 55,
        signature: sig!,
        secret,
      }),
    ).toBe(true);
    expect(
      hasValidImageProxySignature({
        sourceUrl: 'https://img.example.com/b.jpg',
        signature: sig!,
        secret,
      }),
    ).toBe(false);
    expect(
      hasValidImageProxySignature({
        sourceUrl: signedUrl!,
        width: 160,
        height: 208,
        quality: 55,
        signature: sig!,
        secret,
      }),
    ).toBe(false);
  });

  it('throws when image proxy secret is missing at runtime', () => {
    expect(() => getImageProxySecret(undefined)).toThrow(/IMAGE_PROXY_SECRET/);
  });
});
