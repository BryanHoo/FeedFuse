import { createOpenAIClient } from './openaiClient';

interface TranslateHtmlInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  html: string;
}

function getTranslationContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid translate response: missing content');
  }
  return content.trim();
}

export async function translateHtml(input: TranslateHtmlInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/translateHtml',
    requestLabel: 'AI translation request',
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是 HTML 翻译助手。请将用户提供的 HTML 内容翻译为简体中文（zh-CN）。只翻译可见文本，保持原始 HTML 结构不变（标签/层级/列表等），严禁改动任何属性值（尤其 href/src/srcset）与 URL。只输出 HTML 字符串，不要输出解释文字或代码块标记。',
      },
      {
        role: 'user',
        content: input.html,
      },
    ],
  });

  return getTranslationContent(completion.choices?.[0]?.message?.content);
}
