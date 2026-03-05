import { describe, expect, it } from 'vitest';
import { buildImmersiveHtml } from './immersiveRender';

describe('buildImmersiveHtml', () => {
  it('keeps image in original position and appends translation after matching paragraph', () => {
    const baseHtml =
      '<article><p>A</p><img src="https://img.example/a.jpg" alt="cover" /><p>B</p></article>';
    const out = buildImmersiveHtml(baseHtml, [
      { segmentIndex: 0, status: 'succeeded', sourceText: 'A', translatedText: '甲' } as never,
    ]);

    expect(out).toContain('img src="https://img.example/a.jpg"');
    expect(out).toMatch(/<p>A<\/p>\s*<p class="ff-translation">甲<\/p>/);
    expect(out).toMatch(/<img[^>]*>\s*<p>B<\/p>/);
  });
});
