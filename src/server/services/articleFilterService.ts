import type { ArticleFilterSettings } from '../../types';
import { matchesArticleKeywordFilter } from './articleKeywordFilter';

type AiJudgeResult = {
  ok: boolean;
  matched: boolean;
  errorMessage: string | null;
};

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSummaryText(input: { title?: string | null; summary?: string | null }): string {
  return [input.title ?? '', input.summary ?? ''].filter(Boolean).join('\n').trim();
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export interface ArticleFilterEvaluationResult {
  filterStatus: 'passed' | 'filtered' | 'error';
  isFiltered: boolean;
  filteredBy: string[];
  filterErrorMessage: string | null;
  evaluationText: string;
  evaluationSource: 'summary' | 'fulltext';
}

export async function evaluateArticleFilter(input: {
  article: {
    title?: string | null;
    summary?: string | null;
  };
  filter: ArticleFilterSettings;
  fullTextHtml?: string | null;
  fullTextError?: string | null;
  judgeAi: (payload: { prompt: string; articleText: string }) => Promise<AiJudgeResult>;
}): Promise<ArticleFilterEvaluationResult> {
  const summaryText = buildSummaryText(input.article);
  const keywordSettings = input.filter.keyword;

  if (
    keywordSettings.enabled &&
    matchesArticleKeywordFilter(input.article, keywordSettings.keywords)
  ) {
    return {
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: ['keyword'],
      filterErrorMessage: null,
      evaluationText: summaryText,
      evaluationSource: 'summary',
    };
  }

  const fullText = input.fullTextHtml ? stripHtml(input.fullTextHtml) : '';
  const evaluationText = fullText || summaryText;
  const evaluationSource = fullText ? 'fulltext' : 'summary';

  if (
    keywordSettings.enabled &&
    fullText &&
    matchesArticleKeywordFilter({ title: fullText, summary: null }, keywordSettings.keywords)
  ) {
    return {
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: ['keyword'],
      filterErrorMessage: null,
      evaluationText,
      evaluationSource,
    };
  }

  if (!input.filter.ai.enabled || !input.filter.ai.prompt.trim() || !evaluationText.trim()) {
    return {
      filterStatus: 'passed',
      isFiltered: false,
      filteredBy: [],
      filterErrorMessage: null,
      evaluationText,
      evaluationSource,
    };
  }

  const judgeResult = await input.judgeAi({
    prompt: input.filter.ai.prompt,
    articleText: evaluationText,
  });

  if (!judgeResult.ok) {
    return {
      filterStatus: 'error',
      isFiltered: false,
      filteredBy: [],
      filterErrorMessage: judgeResult.errorMessage ?? input.fullTextError ?? 'Unknown error',
      evaluationText,
      evaluationSource,
    };
  }

  if (judgeResult.matched) {
    return {
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: uniq(['ai']),
      filterErrorMessage: null,
      evaluationText,
      evaluationSource,
    };
  }

  return {
    filterStatus: 'passed',
    isFiltered: false,
    filteredBy: [],
    filterErrorMessage: null,
    evaluationText,
    evaluationSource,
  };
}
