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

describe('articleFilterJudge', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata and includes prompt plus article text', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'FILTER' } }],
    });

    const { articleFilterJudge } = await import('./articleFilterJudge');
    const result = await articleFilterJudge({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '过滤广告',
      articleText: 'Sponsored post',
    });

    expect(result).toEqual({ ok: true, matched: true, errorMessage: null });
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/articleFilterJudge',
        requestLabel: 'AI article filter request',
      }),
    );
    expect(createCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('过滤广告'),
          }),
        ]),
      }),
    );
    expect(createCompletionMock.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain('Sponsored post');
  });

  it('parses FILTER and ALLOW decisions', async () => {
    const { articleFilterJudge } = await import('./articleFilterJudge');

    createCompletionMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'FILTER' } }],
    });
    await expect(
      articleFilterJudge({
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: '过滤广告',
        articleText: 'Sponsored post',
      }),
    ).resolves.toEqual({ ok: true, matched: true, errorMessage: null });

    createCompletionMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'ALLOW' } }],
    });
    await expect(
      articleFilterJudge({
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: '过滤广告',
        articleText: 'Weekly roundup',
      }),
    ).resolves.toEqual({ ok: true, matched: false, errorMessage: null });
  });

  it('maps request failures and invalid responses to error results', async () => {
    const { articleFilterJudge } = await import('./articleFilterJudge');

    createCompletionMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(
      articleFilterJudge({
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: '过滤广告',
        articleText: 'Weekly roundup',
      }),
    ).resolves.toEqual({ ok: false, matched: false, errorMessage: 'timeout' });

    createCompletionMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'maybe' } }],
    });
    await expect(
      articleFilterJudge({
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        model: 'gpt-4o-mini',
        prompt: '过滤广告',
        articleText: 'Weekly roundup',
      }),
    ).resolves.toEqual({
      ok: false,
      matched: false,
      errorMessage: 'Invalid article-filter response: unsupported decision',
    });
  });
});
