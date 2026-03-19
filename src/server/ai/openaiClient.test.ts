import { beforeEach, describe, expect, it, vi } from 'vitest';

const createCompletionMock = vi.hoisted(() => vi.fn());
const openAIConstructorMock = vi.hoisted(() => vi.fn());
const writeSystemLogMock = vi.hoisted(() => vi.fn());
const pool = {};

vi.mock('openai', () => ({
  default: class OpenAI {
    chat = {
      completions: {
        create: (...args: unknown[]) => createCompletionMock(...args),
      },
    };

    constructor(input: unknown) {
      openAIConstructorMock(input);
    }
  },
}));

vi.mock('../db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('openaiClient', () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    openAIConstructorMock.mockReset();
    writeSystemLogMock.mockReset();
  });

  it('normalizes baseURL by trimming trailing slash only', async () => {
    const mod = await import('./openaiClient');
    expect(mod.normalizeBaseUrl('https://api.openai.com/v1/')).toBe('https://api.openai.com/v1');
    expect(mod.normalizeBaseUrl('https://api.openai.com/v1')).toBe('https://api.openai.com/v1');
  });

  it('retries localhost baseURL via host.docker.internal on connection errors', async () => {
    createCompletionMock
      .mockRejectedValueOnce(new Error('Connection error.'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      });
    const mod = await import('./openaiClient');

    const client = mod.createOpenAIClient({
      apiBaseUrl: 'http://localhost:8317/v1/',
      apiKey: 'sk-test',
      source: 'server/ai/streamSummarizeText',
      requestLabel: 'AI summary request',
    } as Parameters<typeof mod.createOpenAIClient>[0]);

    await expect(client.chat.completions.create({ model: 'gpt-4o-mini' })).resolves.toEqual({
      choices: [{ message: { content: 'ok' } }],
    });

    expect(openAIConstructorMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'http://localhost:8317/v1',
      }),
    );
    expect(openAIConstructorMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'http://host.docker.internal:8317/v1',
      }),
    );
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'info',
        category: 'external_api',
        source: 'server/ai/streamSummarizeText',
        message: 'AI summary request completed',
        details: null,
        context: expect.objectContaining({
          url: 'http://host.docker.internal:8317/v1',
          method: 'POST',
          model: 'gpt-4o-mini',
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('wraps chat completions and writes success logs', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: 'ok' } }],
    });
    const mod = await import('./openaiClient');

    const client = mod.createOpenAIClient({
      apiBaseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-test',
      source: 'server/ai/streamSummarizeText',
      requestLabel: 'AI summary request',
    } as Parameters<typeof mod.createOpenAIClient>[0]);

    await client.chat.completions.create({ model: 'gpt-4o-mini' });

    expect(openAIConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'https://api.openai.com/v1',
      }),
    );
    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'info',
        category: 'external_api',
        source: 'server/ai/streamSummarizeText',
        message: 'AI summary request completed',
        details: null,
        context: expect.objectContaining({
          url: 'https://api.openai.com/v1',
          method: 'POST',
          model: 'gpt-4o-mini',
          durationMs: expect.any(Number),
        }),
      }),
    );
  });

  it('writes failure logs with details text', async () => {
    createCompletionMock.mockRejectedValue(new Error('Rate limit exceeded'));
    const mod = await import('./openaiClient');

    const client = mod.createOpenAIClient({
      apiBaseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-test',
      source: 'server/ai/streamSummarizeText',
      requestLabel: 'AI summary request',
    } as Parameters<typeof mod.createOpenAIClient>[0]);

    await expect(client.chat.completions.create({ model: 'gpt-4o-mini' })).rejects.toThrow(
      'Rate limit exceeded',
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        level: 'error',
        category: 'external_api',
        source: 'server/ai/streamSummarizeText',
        message: 'AI summary request failed',
        details: expect.stringContaining('Rate limit exceeded'),
        context: expect.objectContaining({
          url: 'https://api.openai.com/v1',
          method: 'POST',
          model: 'gpt-4o-mini',
          durationMs: expect.any(Number),
        }),
      }),
    );
    expect(openAIConstructorMock).toHaveBeenCalledTimes(1);
  });
});
