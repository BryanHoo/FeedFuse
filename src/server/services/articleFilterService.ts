import type { ArticleFilterSettings } from '../../types';
import { matchesArticleKeywordFilter } from './articleKeywordFilter';

type AiJudgeResult = {
  ok: boolean;
  matched: boolean;
  errorMessage: string | null;
};

type EvaluationSource = ArticleFilterEvaluationResult['evaluationSource'];

type ArticleFilterInput = {
  article: {
    title?: string | null;
    summary?: string | null;
  };
  filter: ArticleFilterSettings;
  fullTextHtml?: string | null;
  fullTextError?: string | null;
  judgeAi: (payload: { prompt: string; articleText: string }) => Promise<AiJudgeResult>;
};

type EvaluationContext = {
  evaluationText: string;
  evaluationSource: EvaluationSource;
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

function buildEvaluationContext(input: {
  article: ArticleFilterInput['article'];
  fullTextHtml?: string | null;
}): EvaluationContext {
  const summaryText = buildSummaryText(input.article);
  const fullText = input.fullTextHtml ? stripHtml(input.fullTextHtml) : '';

  if (fullText) {
    return {
      evaluationText: fullText,
      evaluationSource: 'fulltext',
    };
  }

  return {
    evaluationText: summaryText,
    evaluationSource: 'summary',
  };
}

function createEvaluationResult(
  context: EvaluationContext,
  input: Pick<
    ArticleFilterEvaluationResult,
    'filterStatus' | 'isFiltered' | 'filteredBy' | 'filterErrorMessage'
  >,
): ArticleFilterEvaluationResult {
  return {
    ...context,
    ...input,
  };
}

function createFilteredResult(
  context: EvaluationContext,
  filteredBy: ArticleFilterEvaluationResult['filteredBy'],
): ArticleFilterEvaluationResult {
  return createEvaluationResult(context, {
    filterStatus: 'filtered',
    isFiltered: true,
    filteredBy,
    filterErrorMessage: null,
  });
}

function createPassedResult(context: EvaluationContext): ArticleFilterEvaluationResult {
  return createEvaluationResult(context, {
    filterStatus: 'passed',
    isFiltered: false,
    filteredBy: [],
    filterErrorMessage: null,
  });
}

function createErrorResult(
  context: EvaluationContext,
  filterErrorMessage: string,
): ArticleFilterEvaluationResult {
  return createEvaluationResult(context, {
    filterStatus: 'error',
    isFiltered: false,
    filteredBy: [],
    filterErrorMessage,
  });
}

function matchesFullTextKeywordFilter(fullText: string, keywords: string[]): boolean {
  if (!fullText) {
    return false;
  }

  return matchesArticleKeywordFilter(
    { title: fullText, summary: null },
    keywords,
  );
}

function shouldRunAiFilter(input: {
  filter: ArticleFilterSettings;
  evaluationText: string;
}): boolean {
  return Boolean(
    input.filter.ai.enabled &&
      input.filter.ai.prompt.trim() &&
      input.evaluationText.trim(),
  );
}

function resolveJudgeErrorMessage(input: {
  judgeResult: AiJudgeResult;
  fullTextError?: string | null;
}): string {
  return input.judgeResult.errorMessage ?? input.fullTextError ?? 'Unknown error';
}

export interface ArticleFilterEvaluationResult {
  filterStatus: 'passed' | 'filtered' | 'error';
  isFiltered: boolean;
  filteredBy: string[];
  filterErrorMessage: string | null;
  evaluationText: string;
  evaluationSource: 'summary' | 'fulltext';
}

export async function evaluateArticleFilter(
  input: ArticleFilterInput,
): Promise<ArticleFilterEvaluationResult> {
  const summaryContext: EvaluationContext = {
    evaluationText: buildSummaryText(input.article),
    evaluationSource: 'summary',
  };
  const keywordSettings = input.filter.keyword;

  if (
    keywordSettings.enabled &&
    matchesArticleKeywordFilter(input.article, keywordSettings.keywords)
  ) {
    return createFilteredResult(summaryContext, ['keyword']);
  }

  const context = buildEvaluationContext(input);

  if (
    keywordSettings.enabled &&
    context.evaluationSource === 'fulltext' &&
    matchesFullTextKeywordFilter(context.evaluationText, keywordSettings.keywords)
  ) {
    return createFilteredResult(context, ['keyword']);
  }

  if (!shouldRunAiFilter({ filter: input.filter, evaluationText: context.evaluationText })) {
    return createPassedResult(context);
  }

  const judgeResult = await input.judgeAi({
    prompt: input.filter.ai.prompt,
    articleText: context.evaluationText,
  });

  if (!judgeResult.ok) {
    return createErrorResult(
      context,
      resolveJudgeErrorMessage({
        judgeResult,
        fullTextError: input.fullTextError,
      }),
    );
  }

  if (judgeResult.matched) {
    return createFilteredResult(context, ['ai']);
  }

  return createPassedResult(context);
}
