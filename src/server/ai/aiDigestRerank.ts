import { createOpenAIClient } from './openaiClient';

export interface AiDigestRerankItem {
  id: string;
  feedTitle: string;
  title: string;
  summary: string | null;
  link: string | null;
  fetchedAt: string;
}

function unwrapCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function getMessageContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid aiDigestRerank response: missing content');
  }

  return unwrapCodeFence(content);
}

function parseIdArray(content: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid aiDigestRerank response: expected JSON array');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Invalid aiDigestRerank response: expected JSON array');
  }

  return parsed.map((item) => {
    if (typeof item !== 'string') {
      throw new Error('Invalid aiDigestRerank response: non-string id');
    }
    return item.trim();
  });
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }

  return out;
}

export async function aiDigestRerank(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  batch: AiDigestRerankItem[];
}): Promise<string[]> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/aiDigestRerank',
    requestLabel: 'AI digest rerank request',
  });
  const allowedIds = new Set(input.batch.map((item) => item.id).filter((id) => Boolean(id)));

  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是信息筛选助手。根据用户的智能报告提示词，判断本批候选文章里哪些内容与主题相关。只输出 JSON 字符串数组，元素为相关文章 id；不要输出解释、不要输出 Markdown。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          prompt: input.prompt,
          batch: input.batch,
          outputContract: 'JSON string array of ids, subset of batch',
        }),
      },
    ],
  });

  const content = getMessageContent(completion.choices?.[0]?.message?.content);
  const ids = dedupePreserveOrder(parseIdArray(content));

  // Guardrail: ids must be a subset of the input candidate set, otherwise fallback.
  for (const id of ids) {
    if (!allowedIds.has(id)) {
      throw new Error('Invalid aiDigestRerank response: id not in candidates');
    }
  }

  return ids;
}
