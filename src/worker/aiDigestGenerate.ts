import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import { resolveArticleBriefContent } from '../lib/articleSummary';
import { aiDigestCompose, type AiDigestComposeArticle } from '../server/ai/aiDigestCompose';
import { aiDigestRerank, type AiDigestRerankItem } from '../server/ai/aiDigestRerank';
import {
  AI_CONFIG_CHANGED_ERROR_CODE,
  AI_CONFIG_CHANGED_ERROR_MESSAGE,
  AI_CONFIG_CHANGED_RAW_ERROR,
  createConfigFingerprintGuard,
  resolveAiConfigFingerprints,
} from '../server/ai/configFingerprints';
import {
  insertArticleIgnoreDuplicate,
  pruneFeedArticlesToLimit,
} from '../server/repositories/articlesRepo';
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
import {
  writeUserOperationFailedLog,
  writeUserOperationStartedLog,
  writeUserOperationSucceededLog,
} from '../server/logging/userOperationLogger';
import { getAiApiKey, getUiSettings } from '../server/repositories/settingsRepo';
import { sanitizeContent } from '../server/rss/sanitizeContent';

const DEFAULT_DIGEST_MODEL = 'gpt-4o-mini';
const DEFAULT_DIGEST_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_CANDIDATES = 500;
const RERANK_BATCH_SIZE = 12;
const CLUSTER_TITLE_SIMILARITY_THRESHOLD = 0.88;

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
  pruneFeedArticlesToLimit: typeof pruneFeedArticlesToLimit;
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
  pruneFeedArticlesToLimit,
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

function normalizeClusterText(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*[-|｜:：]\s*[^-|｜:：]{1,40}$/u, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalizeLink(link: string | null | undefined): string | null {
  if (!link?.trim()) return null;

  try {
    const url = new URL(link);
    url.hash = '';

    const nextParams = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (isRemovableTrackingParam(key)) {
        continue;
      }
      nextParams.append(key, value);
    }

    const search = nextParams.toString();
    return `${url.hostname.toLowerCase()}${url.pathname}${search ? `?${search}` : ''}`;
  } catch {
    return link.trim().toLowerCase();
  }
}

function isRemovableTrackingParam(key: string): boolean {
  return /^utm_/i.test(key) || ['ref', 'source', 'feature'].includes(key.toLowerCase());
}

function toTitleBigrams(value: string): Set<string> {
  const compact = value.replace(/\s+/g, '');
  if (!compact) return new Set();
  if (compact.length === 1) return new Set([compact]);

  const out = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    out.add(compact.slice(index, index + 2));
  }
  return out;
}

function computeJaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }

  return intersection / (left.size + right.size - intersection);
}

function scoreClusterRepresentative(article: AiDigestCandidateArticleRow): number {
  let score = 0;
  if (article.contentFullHtml) score += 4;
  if (article.summary?.trim()) score += 2;
  score += Math.min(3, Math.floor((article.summary?.trim().length ?? 0) / 80));

  const fetchedAt = Date.parse(article.fetchedAt);
  if (Number.isFinite(fetchedAt)) {
    score += fetchedAt / 1_000_000_000_000;
  }

  return score;
}

type CandidateClusterSignature = {
  canonicalLink: string | null;
  titleKey: string;
  titleBigrams: Set<string>;
};

type CandidateCluster = {
  representative: AiDigestCandidateArticleRow;
  representativeScore: number;
  signature: CandidateClusterSignature;
};

function buildCandidateClusterSignature(article: AiDigestCandidateArticleRow): CandidateClusterSignature {
  const titleKey = normalizeClusterText(article.title);
  return {
    canonicalLink: canonicalizeLink(article.link),
    titleKey,
    titleBigrams: toTitleBigrams(titleKey),
  };
}

function shouldClusterCandidate(
  current: CandidateClusterSignature,
  existing: CandidateClusterSignature,
): boolean {
  if (current.canonicalLink && existing.canonicalLink && current.canonicalLink === existing.canonicalLink) {
    return true;
  }

  if (current.titleKey && existing.titleKey && current.titleKey === existing.titleKey) {
    return true;
  }

  const titleSimilarity = computeJaccardSimilarity(current.titleBigrams, existing.titleBigrams);
  return titleSimilarity >= CLUSTER_TITLE_SIMILARITY_THRESHOLD;
}

function dedupeClusteredArticles(
  articles: AiDigestCandidateArticleRow[],
): AiDigestCandidateArticleRow[] {
  const clusters: CandidateCluster[] = [];

  for (const article of articles) {
    const signature = buildCandidateClusterSignature(article);
    const representativeScore = scoreClusterRepresentative(article);
    const existingCluster = clusters.find((cluster) =>
      shouldClusterCandidate(signature, cluster.signature),
    );

    if (!existingCluster) {
      clusters.push({ representative: article, representativeScore, signature });
      continue;
    }

    if (representativeScore > existingCluster.representativeScore) {
      existingCluster.representative = article;
      existingCluster.representativeScore = representativeScore;
      existingCluster.signature = signature;
    }
  }

  return clusters.map((cluster) => cluster.representative);
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

  if (text === AI_CONFIG_CHANGED_RAW_ERROR) {
    return { errorCode: AI_CONFIG_CHANGED_ERROR_CODE, errorMessage: AI_CONFIG_CHANGED_ERROR_MESSAGE };
  }
  if (text === 'Missing AI API key') {
    return { errorCode: 'missing_api_key', errorMessage: '请先在设置中配置 AI API 密钥' };
  }
  if (/429|rate limit/i.test(text)) {
    return { errorCode: 'ai_rate_limited', errorMessage: '请求太频繁了，请稍后重试' };
  }
  if (/401|unauthorized|api key|Missing AI configuration/i.test(text)) {
    return { errorCode: 'ai_invalid_config', errorMessage: 'AI 配置无效，请检查 AI 设置' };
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

function createSkippedNoUpdatesPatch(model: string | null): {
  status: 'skipped_no_updates';
  selectedCount: number;
  articleId: null;
  model: string | null;
  errorCode: null;
  errorMessage: null;
} {
  return {
    status: 'skipped_no_updates',
    selectedCount: 0,
    articleId: null,
    model,
    errorCode: null,
    errorMessage: null,
  };
}

async function selectRelevantArticles(input: {
  deps: AiDigestGenerateDeps;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  candidates: AiDigestCandidateArticleRow[];
}): Promise<AiDigestCandidateArticleRow[]> {
  if (input.candidates.length === 0) {
    return [];
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
    const selectedIds = new Set<string>();
    for (const batch of chunk(rerankItems, RERANK_BATCH_SIZE)) {
      const ids = await input.deps.aiDigestRerank({
        apiBaseUrl: input.apiBaseUrl,
        apiKey: input.apiKey,
        model: input.model,
        prompt: input.prompt,
        batch,
      });
      for (const id of ids) {
        selectedIds.add(id);
      }
    }

    return input.candidates.filter((candidate) => selectedIds.has(candidate.id));
  } catch {
    // 筛选失败时宁可保留候选，也不要因为模型异常漏掉本应纳入报告的相关内容。
    return input.candidates;
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
  sharedConfigFingerprint?: string | null;
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
  await writeUserOperationStartedLog(input.pool, {
    actionKey: 'aiDigest.generate',
    source: 'worker/aiDigestGenerate',
    context: {
      runId: run.id,
      feedId: run.feedId,
      ...(input.jobId ? { jobId: input.jobId } : {}),
    },
  });

  try {
    const ensureSharedConfigCurrent = createConfigFingerprintGuard({
      initialFingerprint: input.sharedConfigFingerprint ?? null,
      loadCurrentFingerprint: async () => {
        const [rawSettings, aiApiKey] = await Promise.all([
          deps.getUiSettings(input.pool),
          deps.getAiApiKey(input.pool),
        ]);
        return resolveAiConfigFingerprints({
          settings: rawSettings,
          aiApiKey,
          translationApiKey: '',
        }).shared;
      },
    });

    const status = await executeAiDigestRun({
      pool: input.pool,
      run,
      now,
      deps,
      ensureSharedConfigCurrent,
    });
    if (status === 'succeeded') {
      await writeUserOperationSucceededLog(input.pool, {
        actionKey: 'aiDigest.generate',
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
    await writeUserOperationFailedLog(input.pool, {
      actionKey: 'aiDigest.generate',
      source: 'worker/aiDigestGenerate',
      err,
      details: safeErrorText(err),
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
  ensureSharedConfigCurrent: () => Promise<void>;
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
    await input.deps.updateAiDigestRun(
      input.pool,
      input.run.id,
      createSkippedNoUpdatesPatch(null),
    );
    await input.deps.updateAiDigestConfigLastWindowEndAt(input.pool, input.run.feedId, input.run.windowEndAt);
    return 'skipped_no_updates';
  }

  const aiApiKey = await input.deps.getAiApiKey(input.pool);
  if (!aiApiKey.trim()) {
    throw new Error('Missing AI API key');
  }
  await input.ensureSharedConfigCurrent();

  const rawSettings = await input.deps.getUiSettings(input.pool);
  const settings = normalizePersistedSettings(rawSettings);
  const model = settings.ai.model.trim() || DEFAULT_DIGEST_MODEL;
  const apiBaseUrl = settings.ai.apiBaseUrl.trim() || DEFAULT_DIGEST_API_BASE_URL;
  const maxStoredArticlesPerFeed = settings.rss.maxStoredArticlesPerFeed;

  const selected = await selectRelevantArticles({
    deps: input.deps,
    apiBaseUrl,
    apiKey: aiApiKey,
    model,
    prompt: config.prompt,
    candidates,
  });

  const clusteredSelected = dedupeClusteredArticles(selected);

  if (clusteredSelected.length === 0) {
    await input.deps.updateAiDigestRun(
      input.pool,
      input.run.id,
      createSkippedNoUpdatesPatch(model),
    );
    await input.deps.updateAiDigestConfigLastWindowEndAt(input.pool, input.run.feedId, input.run.windowEndAt);
    return 'skipped_no_updates';
  }

  const composed = await input.deps.aiDigestCompose({
    apiBaseUrl,
    apiKey: aiApiKey,
    model,
    prompt: config.prompt,
    articles: toComposeArticles(clusteredSelected),
  });
  await input.ensureSharedConfigCurrent();

  const title = composed.title.trim() || aiDigestFeed?.title || '(智能报告)';
  const sanitized = input.deps.sanitizeContent(composed.html);
  if (!sanitized) {
    throw new Error('Invalid ai digest result: empty html');
  }
  const summary = resolveArticleBriefContent({ contentHtml: sanitized }) || null;

  const dedupeKey = `ai_digest_run:${input.run.id}`;
  const created = await input.deps.insertArticleIgnoreDuplicate(input.pool, {
    feedId: input.run.feedId,
    dedupeKey,
    title,
    publishedAt: input.now.toISOString(),
    contentHtml: sanitized,
    summary,
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

  if (created) {
    await input.deps.pruneFeedArticlesToLimit(
      input.pool,
      input.run.feedId,
      maxStoredArticlesPerFeed,
    );
  }

  await input.deps.replaceAiDigestRunSources(input.pool, {
    runId: input.run.id,
    sources: clusteredSelected.map((candidate, index) => ({
      sourceArticleId: candidate.id,
      position: index,
    })),
  });

  await input.deps.updateAiDigestRun(input.pool, input.run.id, {
    status: 'succeeded',
    selectedCount: clusteredSelected.length,
    articleId,
    model,
    errorCode: null,
    errorMessage: null,
  });

  await input.deps.updateAiDigestConfigLastWindowEndAt(input.pool, input.run.feedId, input.run.windowEndAt);
  return 'succeeded';
}
