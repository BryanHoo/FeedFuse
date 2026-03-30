import { JSDOM } from 'jsdom';
import { createOpenAIClient } from './openaiClient';

export interface AiDigestComposeArticle {
  id: string;
  feedTitle: string;
  title: string;
  summary: string | null;
  link: string | null;
  fetchedAt: string;
  contentFullHtml: string | null;
}

const MAP_BATCH_SIZE = 4;
const DEFAULT_MAX_ARTICLE_TEXT_CHARS = 6000;
const MAX_REDUCE_NOTES_CHARS = 60_000;
const MAX_FOLD_ROUNDS = 3;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTextFromHtml(html: string): string {
  const dom = new JSDOM(html);
  const text = dom.window.document.body?.textContent ?? '';
  return normalizeWhitespace(text);
}

function resolveMaxArticleTextChars(articleCount: number): number {
  if (articleCount >= 120) return 900;
  if (articleCount >= 60) return 1400;
  if (articleCount >= 24) return 2200;
  if (articleCount >= 8) return 3600;
  return DEFAULT_MAX_ARTICLE_TEXT_CHARS;
}

function clipText(value: string, maxChars: number): string {
  return value.length > maxChars ? value.slice(0, maxChars) : value;
}

function buildArticleTextSections(article: AiDigestComposeArticle): string[] {
  const summaryText = normalizeWhitespace(article.summary ?? '');
  const bodyText = article.contentFullHtml ? extractTextFromHtml(article.contentFullHtml) : '';

  return [
    article.title ? `标题：${article.title}` : '',
    summaryText ? `摘要：${summaryText}` : '',
    bodyText ? `正文摘录：${bodyText}` : '',
  ].filter(Boolean);
}

function toArticleText(article: AiDigestComposeArticle, maxChars: number): string {
  const sections = buildArticleTextSections(article);
  const summaryText = normalizeWhitespace(article.summary ?? '');
  const fallback = normalizeWhitespace([article.title, summaryText].filter(Boolean).join('\n'));
  const base = normalizeWhitespace(sections.join('\n')) || fallback;

  return clipText(base, maxChars);
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
    throw new Error('Invalid aiDigestCompose response: missing content');
  }

  return unwrapCodeFence(content);
}

function parseTitleHtml(content: string): { title: string; html: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid aiDigestCompose response: expected JSON object');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid aiDigestCompose response: expected JSON object');
  }

  const title = 'title' in parsed ? (parsed as { title?: unknown }).title : undefined;
  const html = 'html' in parsed ? (parsed as { html?: unknown }).html : undefined;

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Invalid aiDigestCompose response: missing title');
  }
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error('Invalid aiDigestCompose response: missing html');
  }

  return { title: title.trim(), html: html.trim() };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function callChatJson<T>(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  user: unknown;
  requestLabel: string;
}): Promise<T> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/aiDigestCompose',
    requestLabel: input.requestLabel,
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: JSON.stringify(input.user) },
    ],
  });

  const content = getMessageContent(completion.choices?.[0]?.message?.content);
  return JSON.parse(content) as T;
}

type MapBatchNote = {
  id: string;
  feedTitle: string;
  title: string;
  points: string[];
};

async function mapBatch(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  articles: Array<{
    id: string;
    feedTitle: string;
    title: string;
    link: string | null;
    fetchedAt: string;
    text: string;
  }>;
}): Promise<MapBatchNote[]> {
  type MapResult = { items: Array<{ id: string; points: string[] }> };

  const result = await callChatJson<MapResult>({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    model: input.model,
    requestLabel: 'AI digest map request',
    system:
      '你是中文信息提炼助手。根据用户的智能报告提示词，为每篇文章提炼 2-4 条关键事实、变化或信号。只输出 JSON 对象：{ "items": [{ "id": "...", "points": ["..."] }] }，不要输出解释或 Markdown。',
    user: {
      prompt: input.prompt,
      articles: input.articles.map((a) => ({
        id: a.id,
        feedTitle: a.feedTitle,
        title: a.title,
        link: a.link,
        fetchedAt: a.fetchedAt,
        text: a.text,
      })),
    },
  });

  const pointsById = new Map<string, string[]>();
  if (result && typeof result === 'object' && Array.isArray((result as MapResult).items)) {
    for (const item of (result as MapResult).items) {
      if (!item || typeof item !== 'object') continue;
      const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '';
      const points = (item as { points?: unknown }).points;
      if (!id || !Array.isArray(points)) continue;
      const normalizedPoints = points
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 4);
      if (normalizedPoints.length > 0) pointsById.set(id, normalizedPoints);
    }
  }

  return input.articles.map((article) => ({
    id: article.id,
    feedTitle: article.feedTitle,
    title: article.title,
    points: pointsById.get(article.id) ?? [],
  }));
}

async function foldNotesToBudget(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  notesText: string;
}): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/aiDigestCompose',
    requestLabel: 'AI digest fold request',
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是中文压缩助手。把用户提供的笔记压缩为更短的要点列表，保留文章 id 与关键结论。只输出纯文本，不要输出 Markdown code fence。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          prompt: input.prompt,
          notes: input.notesText,
          outputContract: 'plain text bullet list, keep article ids',
        }),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid aiDigestCompose fold response: missing content');
  }

  return content.trim();
}

export async function aiDigestCompose(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  articles: AiDigestComposeArticle[];
}): Promise<{ title: string; html: string }> {
  const maxArticleTextChars = resolveMaxArticleTextChars(input.articles.length);
  const prepared = input.articles.map((article) => ({
    id: article.id,
    feedTitle: article.feedTitle,
    title: article.title,
    link: article.link,
    fetchedAt: article.fetchedAt,
    // 相关篇数变多时压缩单篇表示，避免“全部相关都纳入”把单次上下文推爆。
    text: toArticleText(article, maxArticleTextChars),
  }));

  // Fast-path for small inputs: keep a single completion (makes unit tests deterministic).
  if (prepared.length <= MAP_BATCH_SIZE) {
    const client = createOpenAIClient({
      apiBaseUrl: input.apiBaseUrl,
      apiKey: input.apiKey,
      source: 'server/ai/aiDigestCompose',
      requestLabel: 'AI digest compose request',
    });
    const completion = await client.chat.completions.create({
      model: input.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是中文智能报告助手。根据用户提示词与文章内容生成一篇结构化智能报告，突出主题、变化、信号与可执行结论。只输出 JSON：{ "title": "...", "html": "<p>...</p>" }，不要输出解释或 Markdown。',
        },
        {
          role: 'user',
          content: JSON.stringify({ prompt: input.prompt, articles: prepared }),
        },
      ],
    });

    const content = getMessageContent(completion.choices?.[0]?.message?.content);
    return parseTitleHtml(content);
  }

  const batches = chunk(prepared, MAP_BATCH_SIZE);
  const batchNotes = await Promise.all(
    batches.map((batch) =>
      mapBatch({
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
        model: input.model,
        prompt: input.prompt,
        articles: batch,
      }),
    ),
  );

  const flatNotes = batchNotes.flat();
  let notesText = flatNotes
    .map((note) => {
      const points = note.points.length > 0 ? note.points.join('；') : '（无要点）';
      return `[${note.id}] ${note.feedTitle} / ${note.title}: ${points}`;
    })
    .join('\n');

  // Fold oversized notes before final reduce to keep context bounded.
  for (let round = 0; round < MAX_FOLD_ROUNDS && notesText.length > MAX_REDUCE_NOTES_CHARS; round += 1) {
    notesText = await foldNotesToBudget({
      apiBaseUrl: input.apiBaseUrl,
      apiKey: input.apiKey,
      model: input.model,
      prompt: input.prompt,
      notesText,
    });
  }

  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/aiDigestCompose',
    requestLabel: 'AI digest compose request',
  });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          '你是中文智能报告助手。根据用户提示词与文章要点生成一篇结构化智能报告，突出主题、变化、信号与可执行结论。只输出 JSON：{ "title": "...", "html": "<p>...</p>" }，不要输出解释或 Markdown。',
      },
      {
        role: 'user',
        content: JSON.stringify({
          prompt: input.prompt,
          notes: notesText,
          outputContract: '{title, html}',
        }),
      },
    ],
  });

  const content = getMessageContent(completion.choices?.[0]?.message?.content);
  return parseTitleHtml(content);
}
