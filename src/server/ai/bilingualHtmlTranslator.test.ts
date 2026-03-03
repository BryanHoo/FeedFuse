import { describe, expect, it, vi } from 'vitest';
import {
  extractTranslatableSegments,
  reconstructBilingualHtml,
  translateSegmentsInBatches,
} from './bilingualHtmlTranslator';

describe('bilingualHtmlTranslator', () => {
  it('extracts translatable segments and excludes code/pre text', () => {
    const segments = extractTranslatableSegments(`
      <article>
        <h2>Section Title</h2>
        <p>Normal paragraph</p>
        <pre><code>const x = 1;</code></pre>
        <p>Another paragraph with <code>inline()</code> code</p>
        <table><tr><td>Table cell</td></tr></table>
      </article>
    `);

    const texts = segments.map((segment) => segment.text);
    expect(texts).toContain('Section Title');
    expect(texts).toContain('Normal paragraph');
    expect(texts).toContain('Another paragraph with code');
    expect(texts).toContain('Table cell');
    expect(texts).not.toContain('const x = 1;');
    expect(texts).not.toContain('inline()');
  });

  it('translates segments in batches and keeps segment order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '["段落一","段落二"]' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '["段落三"]' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const translated = await translateSegmentsInBatches({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      batchSize: 2,
      segments: [
        { id: 'seg-0', tagName: 'p', text: 'Paragraph one' },
        { id: 'seg-1', tagName: 'p', text: 'Paragraph two' },
        { id: 'seg-2', tagName: 'p', text: 'Paragraph three' },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(translated.map((item) => item.id)).toEqual(['seg-0', 'seg-1', 'seg-2']);
    expect(translated.map((item) => item.translatedText)).toEqual([
      '段落一',
      '段落二',
      '段落三',
    ]);
  });

  it('reconstructs bilingual blocks with stable data-segment-id and keeps original attributes', () => {
    const html = `
      <article>
        <p>Paragraph <a href="https://example.com/path">link</a></p>
        <p>Second paragraph</p>
      </article>
    `;
    const segments = extractTranslatableSegments(html);
    const output = reconstructBilingualHtml(
      html,
      segments.map((segment) => ({
        ...segment,
        translatedText: `ZH: ${segment.text}`,
      })),
    );

    expect(output).toContain('class="ff-bilingual-block"');
    expect(output).toContain('class="ff-original"');
    expect(output).toContain('class="ff-translation"');
    expect(output).toContain('data-segment-id="seg-0"');
    expect(output).toContain('data-segment-id="seg-1"');
    expect(output).toContain('href="https://example.com/path"');
    expect(output).toContain('ZH: Paragraph link');
    expect(output).toContain('ZH: Second paragraph');
  });
});
