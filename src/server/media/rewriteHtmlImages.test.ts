import { describe, expect, it } from 'vitest';
import { rewriteHtmlImages } from './rewriteHtmlImages';

describe('rewriteHtmlImages', () => {
  it('rewrites img src and srcset without changing node order', () => {
    const html =
      '<article><p>A</p><img src="https://img.example/a.jpg" srcset="https://img.example/a.jpg 1x, https://img.example/a@2x.jpg 2x" alt="cover" /><p>B</p></article>';

    const rewritten = rewriteHtmlImages(
      html,
      (url) => `/api/media/image?url=${encodeURIComponent(url)}`,
    );

    expect(rewritten).toContain(
      'img src="/api/media/image?url=https%3A%2F%2Fimg.example%2Fa.jpg"',
    );
    expect(rewritten).toContain('/api/media/image?url=https%3A%2F%2Fimg.example%2Fa%402x.jpg 2x');
    expect(rewritten).toMatch(/<p>A<\/p><img[^>]*><p>B<\/p>/);
  });

  it('keeps nullish html unchanged', () => {
    expect(rewriteHtmlImages(null, (url) => url)).toBeNull();
    expect(rewriteHtmlImages(undefined, (url) => url)).toBeNull();
  });
});
