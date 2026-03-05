import { describe, expect, it, vi } from 'vitest';
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

  it('renders pending/failed states and ignores unmapped segment index', () => {
    const out = buildImmersiveHtml('<article><p>A</p></article>', [
      { segmentIndex: 0, status: 'pending', sourceText: 'A', translatedText: null } as never,
      { segmentIndex: 9, status: 'succeeded', sourceText: 'X', translatedText: '不应插入' } as never,
      {
        segmentIndex: 0,
        status: 'failed',
        sourceText: 'A',
        translatedText: null,
        errorMessage: '请求超时',
      } as never,
    ]);

    expect(out).toContain('ff-translation-failed');
    expect(out).toContain('data-action="retry-segment"');
    expect(out).not.toContain('不应插入');
  });

  it('inserts translation as text, not html', () => {
    const out = buildImmersiveHtml('<article><p>A</p></article>', [
      {
        segmentIndex: 0,
        status: 'succeeded',
        sourceText: 'A',
        translatedText: '<img src=x onerror=alert(1) />',
      } as never,
    ]);

    expect(out).toContain('&lt;img src=x onerror=alert(1) /&gt;');
  });

  it('falls back to base html when DOMParser is unavailable (SSR safety)', () => {
    const baseHtml = '<article><p>A</p></article>';
    const originalDomParser = globalThis.DOMParser;

    vi.stubGlobal('DOMParser', undefined);
    try {
      expect(() => buildImmersiveHtml(baseHtml, [])).not.toThrow();
      expect(buildImmersiveHtml(baseHtml, [])).toBe(baseHtml);
    } finally {
      vi.stubGlobal('DOMParser', originalDomParser);
    }
  });
});
