interface TranslateHtmlInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  html: string;
}

interface ChatCompletionMessage {
  content?: unknown;
}

interface ChatCompletionChoice {
  message?: ChatCompletionMessage;
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function getTranslationContent(payload: unknown): string {
  const content = (
    payload as Partial<ChatCompletionResponse> | null
  )?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid translate response: missing content');
  }
  return content.trim();
}

export async function translateHtml(input: TranslateHtmlInput): Promise<string> {
  const baseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Translate API failed: ${response.status} ${detail}`.trim());
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return getTranslationContent(payload);
}

