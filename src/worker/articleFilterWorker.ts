import type { PgBoss } from 'pg-boss';
import type { Pool } from 'pg';
import type { ArticleFilterSettings } from '../types';
import { getQueueSendOptions } from '../server/queue/contracts';
import { JOB_AI_TRANSLATE_TITLE } from '../server/queue/jobs';
import { getArticleById, setArticleFilterPending, setArticleFilterResult } from '../server/repositories/articlesRepo';
import { fetchFulltextAndStore } from '../server/fulltext/fetchFulltextAndStore';
import { evaluateArticleFilter } from '../server/services/articleFilterService';
import { enqueueAutoAiTriggersOnFetch } from './autoAiTriggers';

export interface ArticleFilterJobData {
  articleId: string;
  articleFilter: ArticleFilterSettings;
  feed: {
    fullTextOnFetchEnabled: boolean;
    aiSummaryOnFetchEnabled: boolean;
    bodyTranslateOnFetchEnabled: boolean;
    titleTranslateEnabled: boolean;
  };
}

type ArticleFilterWorkerDeps = {
  getArticleById: typeof getArticleById;
  setArticleFilterPending: typeof setArticleFilterPending;
  setArticleFilterResult: typeof setArticleFilterResult;
  fetchFulltextAndStore: typeof fetchFulltextAndStore;
  evaluateArticleFilter: typeof evaluateArticleFilter;
  enqueueAutoAiTriggersOnFetch: typeof enqueueAutoAiTriggersOnFetch;
};

const defaultDeps: ArticleFilterWorkerDeps = {
  getArticleById,
  setArticleFilterPending,
  setArticleFilterResult,
  fetchFulltextAndStore,
  evaluateArticleFilter,
  enqueueAutoAiTriggersOnFetch,
};

export async function runArticleFilterWorker(input: {
  pool: Pool;
  boss: Pick<PgBoss, 'send'>;
  job: ArticleFilterJobData;
  judgeAi: (payload: { prompt: string; articleText: string }) => Promise<{
    ok: boolean;
    matched: boolean;
    errorMessage: string | null;
  }>;
  deps?: Partial<ArticleFilterWorkerDeps>;
}): Promise<void> {
  const deps = { ...defaultDeps, ...(input.deps ?? {}) };
  const article = await deps.getArticleById(input.pool, input.job.articleId);
  if (!article) {
    return;
  }

  await deps.setArticleFilterPending(input.pool, article.id);

  try {
    const prefilterResult = await deps.evaluateArticleFilter({
      article,
      filter: {
        keyword: input.job.articleFilter.keyword,
        ai: { enabled: false, prompt: '' },
      },
      judgeAi: async () => ({ ok: true, matched: false, errorMessage: null }),
    });

    if (prefilterResult.filterStatus === 'filtered') {
      await deps.setArticleFilterResult(input.pool, article.id, {
        filterStatus: 'filtered',
        isFiltered: true,
        filteredBy: prefilterResult.filteredBy,
        filterErrorMessage: null,
      });
      return;
    }

    let articleAfterFilterInput = article;
    if (input.job.feed.fullTextOnFetchEnabled) {
      await deps.fetchFulltextAndStore(input.pool, article.id);
      articleAfterFilterInput = (await deps.getArticleById(input.pool, article.id)) ?? article;
    }

    const result = await deps.evaluateArticleFilter({
      article: articleAfterFilterInput,
      filter: input.job.articleFilter,
      fullTextHtml: articleAfterFilterInput.contentFullHtml,
      fullTextError: articleAfterFilterInput.contentFullError,
      judgeAi: input.judgeAi,
    });

    await deps.setArticleFilterResult(input.pool, article.id, {
      filterStatus: result.filterStatus,
      isFiltered: result.isFiltered,
      filteredBy: result.filteredBy,
      filterErrorMessage: result.filterErrorMessage,
    });

    if (result.filterStatus !== 'passed') {
      return;
    }

    await deps.enqueueAutoAiTriggersOnFetch(input.boss, {
      feed: {
        aiSummaryOnFetchEnabled: input.job.feed.aiSummaryOnFetchEnabled,
        bodyTranslateOnFetchEnabled: input.job.feed.bodyTranslateOnFetchEnabled,
      },
      created: articleAfterFilterInput,
    });

    if (input.job.feed.titleTranslateEnabled && !articleAfterFilterInput.titleZh?.trim()) {
      await input.boss.send(
        JOB_AI_TRANSLATE_TITLE,
        { articleId: article.id },
        getQueueSendOptions(JOB_AI_TRANSLATE_TITLE, { articleId: article.id }),
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.trim() || 'Unknown error' : 'Unknown error';
    await deps.setArticleFilterResult(input.pool, article.id, {
      filterStatus: 'error',
      isFiltered: false,
      filteredBy: [],
      filterErrorMessage: message,
    });
  }
}
