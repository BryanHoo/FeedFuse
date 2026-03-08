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
    });

    expect(proxied).toMatch(/^\/api\/media\/image\?/);

    const parsed = new URL(`http://localhost${proxied}`);
    const signedUrl = parsed.searchParams.get('url');
    const sig = parsed.searchParams.get('sig');

    expect(signedUrl).toBe('https://img.example.com/a.jpg');
    expect(sig).toBeTruthy();
    expect(
      hasValidImageProxySignature({
        sourceUrl: signedUrl!,
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
  });

  it('throws when image proxy secret is missing at runtime', () => {
    expect(() => getImageProxySecret(undefined)).toThrow(/IMAGE_PROXY_SECRET/);
  });
});
