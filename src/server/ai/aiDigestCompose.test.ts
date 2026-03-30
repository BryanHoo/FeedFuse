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
            content: '```json\n{"title":"今日智能报告","html":"<h1>今日智能报告</h1><p>内容</p>"}\n```',
          },
        },
      ],
    });

    const { aiDigestCompose } = await import('./aiDigestCompose');
    const out = await aiDigestCompose({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '请生成这些文章的智能报告',
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

    expect(out.title).toBe('今日智能报告');
    expect(out.html).toContain('<p>内容</p>');
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/aiDigestCompose',
        requestLabel: 'AI digest compose request',
      }),
    );
  });

  it('shrinks each article payload when many related articles are included', async () => {
    const mapPayloads: Array<{ articles: Array<{ text: string }> }> = [];
    createCompletionMock.mockImplementation(async (input: {
      messages: Array<{ role: string; content: string }>;
    }) => {
      const payload = JSON.parse(input.messages[1]?.content ?? '{}') as {
        articles?: Array<{ text: string }>;
      };

      if (Array.isArray(payload.articles)) {
        mapPayloads.push({ articles: payload.articles });
        return {
          choices: [{ message: { content: '{"items":[]}' } }],
        };
      }

      return {
        choices: [
          {
            message: {
              content: '{"title":"智能报告","html":"<p>无相关内容</p>"}',
            },
          },
        ],
      };
    });

    const { aiDigestCompose } = await import('./aiDigestCompose');
    await aiDigestCompose({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '请生成这些文章的智能报告',
      articles: Array.from({ length: 24 }, (_, index) => ({
        id: `a${index + 1}`,
        feedTitle: 'Feed 1',
        title: `Title ${index + 1}`,
        summary: 'Summary '.repeat(400),
        link: `https://example.com/${index + 1}`,
        fetchedAt: '2026-03-14T00:00:00.000Z',
        contentFullHtml: `<p>${'Long body '.repeat(1200)}</p>`,
      })),
    });

    expect(mapPayloads.length).toBeGreaterThan(0);
    expect(mapPayloads[0]?.articles[0]?.text.length).toBeLessThanOrEqual(2200);
    expect(mapPayloads[0]?.articles[0]?.text).toContain('标题：Title 1');
    expect(mapPayloads[0]?.articles[0]?.text).toContain('摘要：');
  });
});
