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

describe('translateHtml', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '<p>你好</p>' } }],
    });

    const { translateHtml } = await import('./translateHtml');
    const out = await translateHtml({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      html: '<p>Hello</p>',
    });

    expect(out).toContain('你好');
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/translateHtml',
        requestLabel: 'AI translation request',
      }),
    );
  });
});
