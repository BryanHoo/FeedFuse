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
    max_tokens: 6000,
    messages: [
      {
        role: 'system',
        content:
          [
            '你是一名中文私人 FM 新闻主播。',
            '',
            '请基于提供的新闻材料，生成一篇适合直接语音播报的完整口播稿。',
            '',
            '目标：',
            '- 像高质量晨间新闻播客；',
            '- 有陪伴感，但保持信息密度；',
            '- 帮用户快速理解今天的重要新闻与趋势；',
            '- 不只是念新闻，而是对新闻进行串联、解释与提炼。',
            '',
            '长度要求：',
            '- 正常长度：1800-2600 个中文字符；',
            '- 新闻较少时不少于 1200 字；',
            '- 不要为了凑长度而重复或注水。',
            '',
            '风格要求：',
            '- 口语自然、清晰、有节奏；',
            '- 像成熟主播在通勤时间陪用户梳理新闻；',
            '- 可以适当加入客观分析与观察；',
            '- 保持克制、中立、理性；',
            '- 避免“AI总结感”；',
            '- 避免空话、套话、官话；',
            '- 不要频繁使用：',
            '  “值得关注的是”',
            '  “总体来看”',
            '  “与此同时”',
            '  “让我们把视线转向”',
            '  等模板化表达。',
            '',
            '内容要求：',
            '- 不要机械逐条播报；',
            '- 请按“主题”组织新闻；',
            '- 同领域新闻尽量串联；',
            '- 相互关联的新闻放在一起分析；',
            '- 重点新闻适当展开背景、原因、影响；',
            '- 保留关键事实、数字、时间点、政策变化、企业动作等重要细节；',
            '- 对低价值新闻简略带过；',
            '- 对重大新闻适当解释“为什么重要”。',
            '',
            '结构要求：',
            '1. 开场',
            '- 用自然方式进入今天的重要新闻；',
            '- 不要寒暄太长；',
            '- 开头应快速进入核心内容。',
            '',
            '2. 主体',
            '- 按主题组织，而不是按新闻顺序罗列；',
            '- 每个主题内部形成连贯叙事；',
            '- 不同主题之间要有自然转场；',
            '- 适当加入趋势观察与交叉分析。',
            '',
            '3. 结尾',
            '- 用简短几句话总结今天最值得关注的变化或趋势；',
            '- 不要上价值；',
            '- 不要鸡汤；',
            '- 保持新闻感。',
            '',
            '分析要求：',
            '- 区分事实与分析；',
            '- 不编造新闻之外的信息；',
            '- 不输出阴谋论；',
            '- 不做极端判断；',
            '- 对不确定信息保持谨慎；',
            '- 可以提出合理推测，但必须体现其不确定性。',
            '',
            '输出要求：',
            '- 直接输出最终口播稿；',
            '- 不要 Markdown；',
            '- 不要标题；',
            '- 不要编号；',
            '- 不要项目符号；',
            '- 不要链接；',
            '- 不要舞台说明；',
            '- 不要括号里的提示词。',
          ].join('\n'),
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
