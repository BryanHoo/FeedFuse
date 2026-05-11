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

describe('composePrivateFmScript', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('asks the model for a full-length morning FM script instead of a short bulletin', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '早上好，这是一份完整口播稿。' } }],
    });

    const { composePrivateFmScript } = await import('./privateFmScript');
    await composePrivateFmScript({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      articles: [
        {
          id: 'article-1',
          feedTitle: '36氪',
          title: 'DeepSeek 拟融资',
          summary: 'DeepSeek 计划募集新资金。',
          contentFullHtml: null,
          fetchedAt: '2026-05-09T00:00:00.000Z',
        },
      ],
    });

    const payload = createCompletionMock.mock.calls[0]?.[0] as {
      max_tokens?: number;
      messages: Array<{ role: string; content: string }>;
    };
    const systemPrompt = payload.messages[0]?.content ?? '';
    const userPayload = JSON.parse(payload.messages[1]?.content ?? '{}') as {
      targetLength?: string;
      outputContract?: string;
    };

    expect(systemPrompt).toContain('1800-2600 个中文字符');
    expect(systemPrompt).toContain('不要写成简短快讯');
    expect(userPayload.targetLength).toBe('1800-2600 Chinese characters');
    expect(userPayload.outputContract).toContain('full-length spoken FM script');
    expect(payload.max_tokens).toBeGreaterThanOrEqual(3200);
  });
});
