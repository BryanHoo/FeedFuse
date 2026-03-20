import type { ArticleFilterKeywordSettings } from '../../types';

function dedupeKeywords(input: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    const key = item.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export function getArticleKeywordsForFeed(
  filter: ArticleFilterKeywordSettings,
  _feedId: string,
): string[] {
  if (!filter.enabled) {
    return [];
  }

  return dedupeKeywords(filter.keywords);
}

export function matchesArticleKeywordFilter(
  article: { title?: string | null; summary?: string | null },
  keywords: string[],
): boolean {
  if (keywords.length === 0) {
    return false;
  }

  const haystack = `${article.title ?? ''}\n${article.summary ?? ''}`.toLowerCase();
  if (!haystack.trim()) {
    return false;
  }

  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}
