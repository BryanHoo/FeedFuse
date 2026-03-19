import { beforeEach, describe, expect, it, vi } from 'vitest';

const createOpenAIClientMock = vi.hoisted(() => vi.fn());
const createCompletionMock = vi.hoisted(() => vi.fn());

vi.mock('./openaiClient', () => ({
  createOpenAIClient: (...args: unknown[]) => {
    createOpenAIClientMock(...args);
    return {
      chat: {
        completions: {
          create: createCompletionMock,
        },
      },
    };
  },
}));

describe('aiDigestCompose', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: '```json\n{"title":"今日解读","html":"<h1>今日解读</h1><p>内容</p>"}\n```',
          },
        },
      ],
    });

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
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/aiDigestCompose',
        requestLabel: 'AI digest compose request',
      }),
    );
  });
});
