import { createOpenAIClient } from './openaiClient';

interface SummarizeTextInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  text: string;
}

function getSummaryContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid summarize response: missing content');
  }
  return content.trim();
}

export async function summarizeText(input: SummarizeTextInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/summarizeText',
    requestLabel: 'AI summary request',
  });

  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是中文摘要助手。请输出简洁中文摘要：先给 1-2 句总结，再给 3-5 条要点。不要返回“TL;DR：”或类似前缀。',
      },
      {
        role: 'user',
        content: input.text,
      },
    ],
  });

  return getSummaryContent(completion.choices?.[0]?.message?.content);
}
