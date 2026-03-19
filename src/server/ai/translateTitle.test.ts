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

describe('translateTitle', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '你好世界' } }],
    });

    const { translateTitle } = await import('./translateTitle');
    const out = await translateTitle({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      title: 'Hello world',
    });

    expect(out).toBe('你好世界');
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/translateTitle',
        requestLabel: 'AI title translation request',
      }),
    );
  });
});
