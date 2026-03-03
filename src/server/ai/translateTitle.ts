interface TranslateTitleInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  title: string;
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
    throw new Error('Invalid translate-title response: missing content');
  }
  return content.trim();
}

export async function translateTitle(input: TranslateTitleInput): Promise<string> {
  const baseUrl = normalizeBaseUrl(input.apiBaseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Translate title API failed: ${response.status} ${detail}`.trim());
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  return getTranslationContent(payload);
}
