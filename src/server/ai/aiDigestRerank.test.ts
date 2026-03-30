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

describe('aiDigestRerank', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '```json\n["a1","a2"]\n```' } }],
    });

    const { aiDigestRerank } = await import('./aiDigestRerank');
    const out = await aiDigestRerank({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '整理这些文章的智能报告',
      batch: [
        {
          id: 'a1',
          feedTitle: 'Feed 1',
          title: 'Title 1',
          summary: null,
          link: null,
          fetchedAt: '2026-03-14T00:00:00.000Z',
        },
        {
          id: 'a2',
          feedTitle: 'Feed 2',
          title: 'Title 2',
          summary: null,
          link: null,
          fetchedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect(out).toEqual(['a1', 'a2']);
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/aiDigestRerank',
        requestLabel: 'AI digest rerank request',
      }),
    );
  });
});
