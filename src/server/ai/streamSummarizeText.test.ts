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

function fakeOpenAiStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield {
        choices: [
          {
            delta: {
              content: chunk,
            },
          },
        ],
      };
    }
  })();
}

describe('streamSummarizeText', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('yields summary text chunks from chat completion stream', async () => {
    const chunks = ['TL;DR', '\n- 第一条', '\n- 第二条'];
    const result: string[] = [];
    const mod = await import('./streamSummarizeText');

    for await (const part of mod.streamSummarizeText(
      {
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-4o-mini',
        text: 'hello',
      },
      {
        createStream: async () => fakeOpenAiStream(chunks),
      },
    )) {
      result.push(part);
    }

    expect(result).toEqual(chunks);
  });

  it('uses a prompt that forbids TL;DR prefixes', async () => {
    createCompletionMock.mockResolvedValue(fakeOpenAiStream(['一句话总结', '\n- 第一条']));
    const result: string[] = [];
    const mod = await import('./streamSummarizeText');

    for await (const part of mod.streamSummarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      text: 'hello',
    })) {
      result.push(part);
    }

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(result).toEqual(['一句话总结', '\n- 第一条']);
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/streamSummarizeText',
        requestLabel: 'AI summary request',
      }),
    );
    expect(systemPrompt).toContain('不要返回');
    expect(systemPrompt).toContain('TL;DR');
    expect(systemPrompt).not.toContain('先给一行 TL;DR');
  });
});
