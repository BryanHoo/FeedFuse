import { createOpenAIClient } from './openaiClient';

interface TranslateTitleInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  title: string;
}

function getTranslationContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid translate-title response: missing content');
  }
  return content.trim();
}

export async function translateTitle(input: TranslateTitleInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/translateTitle',
    requestLabel: 'AI title translation request',
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          '你是标题翻译助手。请将用户给出的文章标题翻译成简体中文（zh-CN），仅输出翻译后的标题文本，不要输出解释。',
      },
      {
        role: 'user',
        content: input.title,
      },
    ],
  });

  return getTranslationContent(completion.choices?.[0]?.message?.content);
}
