import { describe, expect, it } from 'vitest';

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
});
