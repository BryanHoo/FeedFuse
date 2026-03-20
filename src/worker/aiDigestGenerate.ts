import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import { aiDigestCompose, type AiDigestComposeArticle } from '../server/ai/aiDigestCompose';
import { aiDigestRerank, type AiDigestRerankItem } from '../server/ai/aiDigestRerank';
import { insertArticleIgnoreDuplicate } from '../server/repositories/articlesRepo';
import {
  getAiDigestConfigByFeedId,
  getAiDigestRunById,
  listAiDigestCandidateArticles,
  replaceAiDigestRunSources,
  updateAiDigestConfigLastWindowEndAt,
  updateAiDigestRun,
  type AiDigestCandidateArticleRow,
  type AiDigestConfigRow,
  type AiDigestRunRow,
} from '../server/repositories/aiDigestRepo';
import { listFeeds } from '../server/repositories/feedsRepo';
import { writeSystemLog } from '../server/logging/systemLogger';
import { getAiApiKey, getUiSettings } from '../server/repositories/settingsRepo';
import { sanitizeContent } from '../server/rss/sanitizeContent';

const DEFAULT_DIGEST_MODEL = 'gpt-4o-mini';
const DEFAULT_DIGEST_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_CANDIDATES = 500;
const RERANK_BATCH_SIZE = 12;

type AiDigestGenerateDeps = {
  getAiDigestRunById: typeof getAiDigestRunById;
  getAiDigestConfigByFeedId: typeof getAiDigestConfigByFeedId;
  listFeeds: typeof listFeeds;
  listAiDigestCandidateArticles: typeof listAiDigestCandidateArticles;
  updateAiDigestRun: typeof updateAiDigestRun;
  updateAiDigestConfigLastWindowEndAt: typeof updateAiDigestConfigLastWindowEndAt;
  getAiApiKey: typeof getAiApiKey;
  getUiSettings: typeof getUiSettings;
  aiDigestRerank: typeof aiDigestRerank;
  aiDigestCompose: typeof aiDigestCompose;
  sanitizeContent: typeof sanitizeContent;
  insertArticleIgnoreDuplicate: typeof insertArticleIgnoreDuplicate;
  queryArticleIdByDedupeKey: (pool: Pool, input: { feedId: string; dedupeKey: string }) => Promise<string | null>;
  replaceAiDigestRunSources: typeof replaceAiDigestRunSources;
};

const defaultDeps: AiDigestGenerateDeps = {
  getAiDigestRunById,
  getAiDigestConfigByFeedId,
  listFeeds,
  listAiDigestCandidateArticles,
  updateAiDigestRun,
  updateAiDigestConfigLastWindowEndAt,
  getAiApiKey,
  getUiSettings,
  aiDigestRerank,
  aiDigestCompose,
  sanitizeContent,
  insertArticleIgnoreDuplicate,
  replaceAiDigestRunSources,
  queryArticleIdByDedupeKey: async (pool, input) => {
    const { rows } = await pool.query<{ id: string }>(
      `
        select id
        from articles
        where feed_id = $1 and dedupe_key = $2
        limit 1
      `,
      [input.feedId, input.dedupeKey],
    );
    return rows[0]?.id ?? null;
  },
};

function resolveDeps(overrides: Partial<AiDigestGenerateDeps> | undefined): AiDigestGenerateDeps {
  return {
    ...defaultDeps,
    ...(overrides ?? {}),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function safeErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Unknown error';
  return 'Unknown error';
}

function mapDigestError(err: unknown): { errorCode: string; errorMessage: string } {
  const text = safeErrorText(err).replace(/\s+/g, ' ').trim().slice(0, 200);

  if (text === 'Missing AI API key') {
    return { errorCode: 'missing_api_key', errorMessage: '请先在设置中配置 AI API 密钥' };
  }
  if (/429|rate limit/i.test(text)) {
    return { errorCode: 'ai_rate_limited', errorMessage: '请求太频繁了，请稍后重试' };
  }
  if (/401|unauthorized|api key/i.test(text)) {
    return { errorCode: 'ai_invalid_config', errorMessage: 'AI 配置无效，请检查 API 密钥' };
  }
  if (/Invalid .*response/i.test(text)) {
    return { errorCode: 'ai_bad_response', errorMessage: 'AI 返回结果异常，请稍后重试' };
  }

  return { errorCode: 'unknown_error', errorMessage: '暂时无法完成处理，请稍后重试' };
}

function resolveTargetFeedIds(input: {
  config: AiDigestConfigRow;
  feeds: Awaited<ReturnType<typeof listFeeds>>;
}): string[] {
  const rssFeedIds = new Set(
    input.feeds.filter((feed) => feed.kind === 'rss').map((feed) => feed.id),
  );
  return uniq(input.config.selectedFeedIds.filter((id) => rssFeedIds.has(id)));
}

async function pickTopNArticles(input: {
  deps: AiDigestGenerateDeps;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  topN: number;
  candidates: AiDigestCandidateArticleRow[];
}): Promise<AiDigestCandidateArticleRow[]> {
  const topN = Math.max(1, Math.floor(input.topN));
  if (input.candidates.length <= topN) {
    return input.candidates.slice(0, topN);
  }

  const rerankItems: AiDigestRerankItem[] = input.candidates.map((candidate) => ({
    id: candidate.id,
    feedTitle: candidate.feedTitle,
    title: candidate.title,
    summary: candidate.summary,
    link: candidate.link,
    fetchedAt: candidate.fetchedAt,
  }));

  try {
    let shortlist: AiDigestRerankItem[] = [];
    for (const batch of chunk(rerankItems, RERANK_BATCH_SIZE)) {
      const ids = await input.deps.aiDigestRerank({
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
        model: input.model,
        prompt: input.prompt,
        topN,
        shortlist,
        batch,
      });

      const byId = new Map<string, AiDigestRerankItem>();
      for (const item of [...shortlist, ...batch]) {
        byId.set(item.id, item);
      }
      shortlist = ids.map((id) => byId.get(id)).filter((item): item is AiDigestRerankItem => Boolean(item));
    }

    const selectedIdSet = new Set(shortlist.map((item) => item.id));
    const selected = input.candidates.filter((candidate) => selectedIdSet.has(candidate.id));
    return selected.slice(0, topN);
  } catch {
    return input.candidates.slice(0, topN);
  }
}

function toComposeArticles(selected: AiDigestCandidateArticleRow[]): AiDigestComposeArticle[] {
  return selected.map((candidate) => ({
    id: candidate.id,
    feedTitle: candidate.feedTitle,
    title: candidate.title,
    summary: candidate.summary,
    link: candidate.link,
    fetchedAt: candidate.fetchedAt,
    contentFullHtml: candidate.contentFullHtml,
  }));
}

export async function runAiDigestGenerate(input: {
  pool: Pool;
  runId: string;
  jobId: string | null;
  isFinalAttempt: boolean;
  now?: Date;
  deps?: Partial<AiDigestGenerateDeps>;
}): Promise<void> {
  const deps = resolveDeps(input.deps);
  const now = input.now ?? new Date();

  const run = await deps.getAiDigestRunById(input.pool, input.runId);
  if (!run) {
    throw new Error('AI digest run not found');
  }

  // Idempotency: if a retry comes in after success, do nothing.
  if (run.status === 'succeeded' && run.articleId) {
    return;
  }

  await deps.updateAiDigestRun(input.pool, run.id, {
    status: 'running',
    jobId: input.jobId ?? run.jobId ?? null,
    errorCode: null,
    errorMessage: null,
  });
  await writeSystemLog(input.pool, {
    level: 'info',
    category: 'ai_digest',
    message: 'AI digest started',
    source: 'worker/aiDigestGenerate',
    context: {
      runId: run.id,
      feedId: run.feedId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
    },
  });

  try {
    const status = await executeAiDigestRun({
      pool: input.pool,
      run,
      now,
      deps,
    });
    if (status === 'succeeded') {
      await writeSystemLog(input.pool, {
        level: 'info',
        category: 'ai_digest',
        message: 'AI digest succeeded',
        source: 'worker/aiDigestGenerate',
        context: {
          runId: run.id,
          feedId: run.feedId,
          ...(input.jobId ? { jobId: input.jobId } : {}),
        },
      });
    }
  } catch (err) {
    const mapped = mapDigestError(err);
    await deps.updateAiDigestRun(input.pool, run.id, {
      status: 'failed',
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    });
    await writeSystemLog(input.pool, {
      level: 'error',
      category: 'ai_digest',
      message: 'AI digest failed',
      details: safeErrorText(err),
      source: 'worker/aiDigestGenerate',
      context: {
        runId: run.id,
        feedId: run.feedId,
        ...(input.jobId ? { jobId: input.jobId } : {}),
      },
    });

    // Important: avoid a permanently failed run blocking future windows.
    if (input.isFinalAttempt) {
      await deps.updateAiDigestConfigLastWindowEndAt(input.pool, run.feedId, run.windowEndAt);
    }

    throw err instanceof Error ? err : new Error(safeErrorText(err));
  }
}

async function executeAiDigestRun(input: {
  pool: Pool;
  run: AiDigestRunRow;
  now: Date;
  deps: AiDigestGenerateDeps;
}): Promise<'skipped_no_updates' | 'succeeded'> {
  const config = await input.deps.getAiDigestConfigByFeedId(input.pool, input.run.feedId);
  if (!config) {
    throw new Error('AI digest config not found');
  }

  const feeds = await input.deps.listFeeds(input.pool);
  const aiDigestFeed = feeds.find((feed) => feed.id === input.run.feedId) ?? null;

  const targetFeedIds = resolveTargetFeedIds({ config, feeds });
  const candidates = await input.deps.listAiDigestCandidateArticles(input.pool, {
    targetFeedIds,
    windowStartAt: input.run.windowStartAt,
    windowEndAt: input.run.windowEndAt,
    limit: MAX_CANDIDATES,
  });

  await input.deps.updateAiDigestRun(input.pool, input.run.id, {
    candidateTotal: candidates.length,
  });

  if (candidates.length === 0) {
    await input.deps.updateAiDigestRun(input.pool, input.run.id, {
      status: 'skipped_no_updates',
      selectedCount: 0,
      articleId: null,
      model: null,
      errorCode: null,
      errorMessage: null,
    });
    await input.deps.updateAiDigestConfigLastWindowEndAt(input.pool, input.run.feedId, input.run.windowEndAt);
    return 'skipped_no_updates';
  }

  const aiApiKey = await input.deps.getAiApiKey(input.pool);
  if (!aiApiKey.trim()) {
    throw new Error('Missing AI API key');
  }

  const rawSettings = await input.deps.getUiSettings(input.pool);
  const settings = normalizePersistedSettings(rawSettings);
  const model = settings.ai.model.trim() || DEFAULT_DIGEST_MODEL;
  const apiBaseUrl = settings.ai.apiBaseUrl.trim() || DEFAULT_DIGEST_API_BASE_URL;

  const selected = await pickTopNArticles({
    deps: input.deps,
    apiBaseUrl,
    apiKey: aiApiKey,
    model,
    prompt: config.prompt,
    topN: config.topN,
    candidates,
  });

  const composed = await input.deps.aiDigestCompose({
    apiBaseUrl,
    apiKey: aiApiKey,
    model,
    prompt: config.prompt,
    articles: toComposeArticles(selected),
  });

  const title = composed.title.trim() || aiDigestFeed?.title || '(AI解读)';
  const sanitized = input.deps.sanitizeContent(composed.html);
  if (!sanitized) {
    throw new Error('Invalid ai digest result: empty html');
  }

  const dedupeKey = `ai_digest_run:${input.run.id}`;
  const created = await input.deps.insertArticleIgnoreDuplicate(input.pool, {
    feedId: input.run.feedId,
    dedupeKey,
    title,
    publishedAt: input.now.toISOString(),
    contentHtml: sanitized,
    summary: null,
    filterStatus: 'passed',
    isFiltered: false,
    filteredBy: [],
    filterErrorMessage: null,
  });

  const articleId =
    created?.id ?? input.run.articleId ?? (await input.deps.queryArticleIdByDedupeKey(input.pool, { feedId: input.run.feedId, dedupeKey }));
  if (!articleId) {
    throw new Error('Failed to persist AI digest article');
  }

  await input.deps.replaceAiDigestRunSources(input.pool, {
    runId: input.run.id,
    sources: selected.map((candidate, index) => ({
      sourceArticleId: candidate.id,
      position: index,
    })),
  });

  await input.deps.updateAiDigestRun(input.pool, input.run.id, {
    status: 'succeeded',
    selectedCount: selected.length,
    articleId,
    model,
    errorCode: null,
    errorMessage: null,
  });

  await input.deps.updateAiDigestConfigLastWindowEndAt(input.pool, input.run.feedId, input.run.windowEndAt);
  return 'succeeded';
}
