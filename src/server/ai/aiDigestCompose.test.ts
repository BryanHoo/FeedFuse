import { describe, expect, it, vi } from 'vitest';

function getFetchUrl(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'url' in arg) {
    const url = (arg as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return '';
}

describe('aiDigestCompose', () => {
  it('returns {title, html} and can parse code-fenced JSON', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"title":"今日解读","html":"<h1>今日解读</h1><p>内容</p>"}\n```',
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const { aiDigestCompose } = await import('./aiDigestCompose');
    const out = await aiDigestCompose({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '请解读这些文章',
      articles: [
        {
          id: 'a1',
          feedTitle: 'Feed 1',
          title: 'Title 1',
          summary: 'Summary 1',
          link: 'https://example.com/1',
          fetchedAt: '2026-03-14T00:00:00.000Z',
          contentFullHtml: null,
        },
      ],
    });

    expect(out.title).toBe('今日解读');
    expect(out.html).toContain('<p>内容</p>');
    expect(fetchMock).toHaveBeenCalled();
    expect(getFetchUrl(fetchMock.mock.calls[0]?.[0])).toBe('https://api.openai.com/v1/chat/completions');
  });
});
