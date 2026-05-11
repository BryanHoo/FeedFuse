import { JSDOM } from 'jsdom';
import { createOpenAIClient } from './openaiClient';

export interface PrivateFmScriptArticle {
  id: string;
  feedTitle: string;
  title: string;
  summary: string | null;
  contentFullHtml: string | null;
  fetchedAt: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractTextFromHtml(html: string): string {
  const dom = new JSDOM(html);
  return normalizeWhitespace(dom.window.document.body?.textContent ?? '');
}

function articleToText(article: PrivateFmScriptArticle): string {
  const body = article.contentFullHtml ? extractTextFromHtml(article.contentFullHtml).slice(0, 1800) : '';
  return [
    `来源：${article.feedTitle}`,
    `标题：${article.title}`,
    article.summary ? `摘要：${normalizeWhitespace(article.summary)}` : '',
    body ? `正文摘录：${body}` : '',
  ].filter(Boolean).join('\n');
}

export async function composePrivateFmScript(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  articles: PrivateFmScriptArticle[];
}): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/privateFmScript',
    requestLabel: 'Private FM script request',
  });

  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.35,
    max_tokens: 3600,
    messages: [
      {
        role: 'system',
        content:
          [
            '你是中文私人早班 FM 主播。请根据原始新闻材料写一份适合直接朗读的完整口播稿。',
            '目标长度：1800-2600 个中文字符，约 6-9 分钟收听；素材特别少时也尽量不少于 1200 个中文字符。',
            '不要写成简短快讯，不要只罗列标题；要按主题组织，补足转场、解释背景、影响判断和听众关切。',
            '结构要求：自然开场、3-5 个主题板块、每个板块串联多条相关新闻、重点新闻展开两到三句、结尾简短收束。',
            '风格要求：口语、清楚、有节奏，像主播在早班通勤时陪用户梳理新闻。',
            '安全要求：不要输出 Markdown、标题编号、链接或舞台说明；不要编造材料外事实。',
          ].join(''),
      },
      {
        role: 'user',
        content: JSON.stringify({
          output: 'plain text script',
          outputContract: 'full-length spoken FM script, no markdown, no headings',
          targetLength: '1800-2600 Chinese characters',
          articles: input.articles.map(articleToText),
        }),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid private FM script response: missing content');
  }

  return content.trim();
}
