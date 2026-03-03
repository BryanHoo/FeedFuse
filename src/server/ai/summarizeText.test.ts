import { describe, expect, it, vi } from 'vitest';

function getFetchUrl(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && 'url' in arg) {
    const url = (arg as { url?: unknown }).url;
    if (typeof url === 'string') return url;
  }
  return '';
}

describe('summarizeText', () => {
  it('calls chat/completions and returns content', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'TL;DR: ...' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { summarizeText } = await import('./summarizeText');
    const out = await summarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      text: 'hello',
    });

    expect(out).toContain('TL;DR');
    expect(fetchMock).toHaveBeenCalled();
    expect(getFetchUrl(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://api.openai.com/v1/chat/completions',
    );
  });
});
