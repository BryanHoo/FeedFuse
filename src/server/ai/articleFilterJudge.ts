import { createOpenAIClient } from './openaiClient';

export interface ArticleFilterJudgeResult {
  ok: boolean;
  matched: boolean;
  errorMessage: string | null;
}

function buildPrompt(input: { prompt: string; articleText: string }): string {
  return [
    '你是文章过滤助手。',
    '根据给定过滤规则判断这篇文章是否应该被过滤。',
    '如果应该过滤，只输出 FILTER。',
    '如果不应该过滤，只输出 ALLOW。',
    '',
    '过滤规则：',
    input.prompt,
    '',
    '文章内容：',
    input.articleText,
  ].join('\n');
}

function parseJudgeContent(content: unknown): ArticleFilterJudgeResult {
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, matched: false, errorMessage: 'Invalid article-filter response: missing content' };
  }

  const normalized = content.trim().toUpperCase();
  if (normalized === 'FILTER') {
    return { ok: true, matched: true, errorMessage: null };
  }
  if (normalized === 'ALLOW') {
    return { ok: true, matched: false, errorMessage: null };
  }

  return { ok: false, matched: false, errorMessage: 'Invalid article-filter response: unsupported decision' };
}

export async function articleFilterJudge(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  articleText: string;
}): Promise<ArticleFilterJudgeResult> {
  try {
    const client = createOpenAIClient({
      apiBaseUrl: input.apiBaseUrl,
      apiKey: input.apiKey,
      source: 'server/ai/articleFilterJudge',
      requestLabel: 'AI article filter request',
    });

    const completion = await client.chat.completions.create({
      model: input.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: '你是文章过滤助手。仅输出 FILTER 或 ALLOW。',
        },
        {
          role: 'user',
          content: buildPrompt({
            prompt: input.prompt,
            articleText: input.articleText,
          }),
        },
      ],
    });

    return parseJudgeContent(completion.choices?.[0]?.message?.content);
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() || 'Unknown error' : 'Unknown error';
    return {
      ok: false,
      matched: false,
      errorMessage: message,
    };
  }
}
