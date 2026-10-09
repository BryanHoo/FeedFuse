import crypto from 'node:crypto';
import process from 'node:process';
import type { PgBoss } from 'pg-boss';
import { getPool } from '@/server/infra/db/pool';
import {
  getFeedForFetch,
  listEnabledFeedsForFetch,
  recordFeedFetchResult,
} from '@/server/domains/feeds/repositories/feedsRepo';
import {
  getArticleById,
  insertArticleIgnoreDuplicate,
  insertArticleMediaAttachments,
  pruneFeedArticlesToLimit,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  getAiApiKey,
  getAppSettings,
  getTranslationApiKey,
  getUiSettings,
} from '@/server/domains/settings/repositories/settingsRepo';
import { fetchFeedXml } from '@/server/integrations/rss/fetchFeedXml';
import { parseFeed } from '@/server/integrations/rss/parseFeed';
import { sanitizeContent } from '@/server/integrations/rss/sanitizeContent';
import {
  formatExternalUrlSafetyMessage,
  getExternalUrlSafety,
} from '@/server/integrations/rss/ssrfGuard';
import { fetchFulltextAndStore } from '@/server/integrations/fulltext/fetchFulltextAndStore';
import { translateSegmentsInBatches } from '@/server/integrations/ai/bilingualHtmlTranslator';
import {
  createConfigFingerprintGuard,
  resolveAiConfigFingerprints,
} from '@/server/integrations/ai/configFingerprints';
import { articleFilterJudge } from '@/server/integrations/ai/articleFilterJudge';
import {
  isTranslationConfigComplete,
  resolveTranslationConfig,
} from '@/server/integrations/ai/translationConfig';
import { startBoss } from '@/server/infra/queue/boss';
import { bootstrapQueues } from '@/server/infra/queue/bootstrap';
import { getQueueSendOptions, QUEUE_CONTRACTS } from '@/server/infra/queue/contracts';
import { createQueueTransactionDb } from '@/server/infra/queue/transactionDb';
import {
  JOB_AI_DIGEST_GENERATE,
  JOB_AI_DIGEST_TICK,
  JOB_AI_SUMMARIZE,
  JOB_AI_TRANSLATE,
  JOB_AI_TRANSLATE_TITLE,
  JOB_ARTICLE_FILTER,
  JOB_ARTICLE_FILTER_RECOVER,
  JOB_ARTICLE_FULLTEXT_FETCH,
  JOB_FEVER_SYNC,
  JOB_FEVER_SYNC_DUE,
  JOB_FEED_FETCH,
  JOB_REFRESH_ALL,
  JOB_SYSTEM_LOG_CLEANUP,
} from '@/server/infra/queue/jobs';
import { sampleQueueStats } from '@/server/infra/queue/observability';
import { mapFeedFetchError } from '@/server/domains/feeds/tasks/feedFetchErrorMapping';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { registerWorkers } from '@/worker/workerRegistry';
import { createWorkerLifecycle } from '@/worker/lifecycle';
import { startWorkerHeartbeat } from '@/worker/heartbeat';
import { buildFeedFetchJobData, selectFeedsForRefreshAll } from '@/worker/refreshAll';
import { isFeedDue } from '@/worker/rssScheduler';
import { runArticleTaskWithStatus } from '@/worker/articleTaskStatus';
import { runImmersiveTranslateSession } from '@/worker/immersiveTranslateWorker';
import { runAiSummaryStreamWorker } from '@/worker/aiSummaryStreamWorker';
import { runAiTitleTranslateWorker } from '@/worker/aiTitleTranslateWorker';
import { runAiDigestTick } from '@/worker/aiDigestTick';
import { runAiDigestGenerate } from '@/worker/aiDigestGenerate';
import { runFeverAutoSyncWorker } from '@/worker/feverAutoSync';
import { enqueueFeverRefreshAllTargets } from '@/worker/feverRefreshAll';
import { runFeverSyncWorker } from '@/worker/feverSync';
import { runArticleFilterWorker, type ArticleFilterJobData } from '@/worker/articleFilterWorker';
import { runArticleFilterRecovery } from '@/worker/articleFilterRecovery';
import { runSystemLogCleanup } from '@/worker/systemLogCleanup';
import { normalizeUserId } from '@/server/domains/users/userScope';
import { listUsers } from '@/server/domains/auth/repositories/usersRepo';
import {
  attachFeedRefreshRunItems,
  completeFeedRefreshRunItem,
  markFeedRefreshRunItemRunning,
} from '@/server/domains/feeds/services/feedRefreshRunService';
import { listEnabledFeverAccounts, markFeverAccountSyncAttempted } from '@/server/domains/fever/repositories/feverAccountsRepo';
import { listActiveLocalFeedIdsByFeverAccountId } from '@/server/domains/fever/repositories/feverMappingsRepo';

const DEFAULT_TRANSLATION_MODEL = 'gpt-4o-mini';
const DEFAULT_TRANSLATION_API_BASE_URL = 'https://api.openai.com/v1';

function readStringField(data: unknown, key: string): string | null {
  return typeof data === 'object' &&
    data !== null &&
    key in data &&
    typeof (data as Record<string, unknown>)[key] === 'string'
    ? ((data as Record<string, string>)[key])
    : null;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildDedupeKey(input: {
  guid: string | null;
  link: string | null;
  title: string;
  publishedAt: Date;
}): string {
  const guid = input.guid?.trim();
  if (guid) return `guid:${guid}`;

  const link = input.link?.trim();
  if (link) return `link:${link}`;

  return `hash:${sha256(`${input.title}|${input.publishedAt.toISOString()}|${input.link ?? ''}`)}`;
}

function getJobData(job: unknown): unknown {
  return typeof job === 'object' && job !== null && 'data' in job
    ? (job as { data?: unknown }).data
    : null;
}

function readBooleanField(data: unknown, key: string): boolean | null {
  return typeof data === 'object' &&
    data !== null &&
    key in data &&
    typeof (data as Record<string, unknown>)[key] === 'boolean'
    ? (data as Record<string, boolean>)[key]
    : null;
}

async function listActiveWorkerUserIds(pool: ReturnType<typeof getPool>): Promise<string[]> {
  const users = await listUsers(pool);
  return users.filter((user) => user.status === 'active').map((user) => user.id);
}

type FeedFetchResult = {
  inserted: number;
  errorMessage: string | null;
};

type FeedIngestionDeps = {
  getPool: typeof getPool;
  getFeedForFetch: typeof getFeedForFetch;
  getExternalUrlSafety: typeof getExternalUrlSafety;
  getAppSettings: typeof getAppSettings;
  getUiSettings: typeof getUiSettings;
  fetchFeedXml: typeof fetchFeedXml;
  parseFeed: typeof parseFeed;
  sanitizeContent: typeof sanitizeContent;
  insertArticleIgnoreDuplicate: typeof insertArticleIgnoreDuplicate;
  insertArticleMediaAttachments: typeof insertArticleMediaAttachments;
  pruneFeedArticlesToLimit: typeof pruneFeedArticlesToLimit;
  recordFeedFetchResult: typeof recordFeedFetchResult;
  isFeedDue: typeof isFeedDue;
};

const defaultFeedIngestionDeps: FeedIngestionDeps = {
  getPool,
  getFeedForFetch,
  getExternalUrlSafety,
  getAppSettings,
  getUiSettings,
  fetchFeedXml,
  parseFeed,
  sanitizeContent,
  insertArticleIgnoreDuplicate,
  insertArticleMediaAttachments,
  pruneFeedArticlesToLimit,
  recordFeedFetchResult,
  isFeedDue,
};

export async function enqueueRefreshAll(
  boss: PgBoss,
  input?: { userId?: string; force?: boolean; runId?: string; now?: Date },
) {
  const pool = getPool();
  const scopedUserId = normalizeUserId(input?.userId);
  const feeds = await listEnabledFeedsForFetch(pool, scopedUserId);
  const now = input?.now ?? new Date();
  const force = Boolean(input?.force);
  const targetFeeds = selectFeedsForRefreshAll(feeds, now, { force });
  // 用户主动全量刷新时，要把 Fever 账号同步也并入同一轮 run 跟踪里。
  const feverAccounts = force ? await listEnabledFeverAccounts(pool, scopedUserId) : [];
  const feverTargets = await Promise.all(
    feverAccounts.map(async (account) => ({
      userId: account.userId,
      accountId: account.id,
      feedIds: await listActiveLocalFeedIdsByFeverAccountId(pool, account.id, account.userId),
    })),
  );
  const targetFeverJobs = feverTargets.filter((target) => target.feedIds.length > 0);
  const allTargetFeedIds = [
    ...targetFeeds.map((feed) => feed.id),
    ...targetFeverJobs.flatMap((target) => target.feedIds),
  ];

  if (input?.runId) {
    await attachFeedRefreshRunItems(pool, {
      runId: input.runId,
      userId: scopedUserId,
      targetFeedIds: allTargetFeedIds,
    });
  }

  await Promise.all(
    [
      ...targetFeeds.map((feed) => {
        const payload = buildFeedFetchJobData(feed.id, {
          userId: feed.userId,
          force,
          runId: input?.runId,
        });
        return boss.send(JOB_FEED_FETCH, payload, getQueueSendOptions(JOB_FEED_FETCH, payload));
      }),
    ],
  );
  const feverEnqueued = await enqueueFeverRefreshAllTargets({
    boss,
    pool,
    runId: input?.runId,
    now,
    feverTargets: targetFeverJobs,
    markFeverAccountSyncAttempted,
  });
  if (input?.runId) {
    for (const target of feverEnqueued.skippedTargets) {
      for (const feedId of target.feedIds) {
        await completeFeedRefreshRunItem(pool, {
          runId: input.runId,
          userId: scopedUserId,
          feedId,
          status: 'failed',
          errorMessage: 'Fever 同步任务已在队列中',
        });
      }
    }
  }
  return { enqueued: targetFeeds.length + feverEnqueued.enqueued };
}

export async function fetchAndIngestFeed(
  boss: PgBoss,
  feedId: string,
  input?: { userId?: string; force?: boolean; deps?: Partial<FeedIngestionDeps> },
): Promise<FeedFetchResult> {
  const deps = { ...defaultFeedIngestionDeps, ...(input?.deps ?? {}) };
  const pool = deps.getPool();
  const feed = await deps.getFeedForFetch(pool, feedId, input?.userId);
  if (!feed) {
    return { inserted: 0, errorMessage: '订阅源不存在' };
  }

  if (!feed.enabled) {
    return { inserted: 0, errorMessage: '订阅源已停用' };
  }

  const force = Boolean(input?.force);
  if (!force && !deps.isFeedDue({ lastFetchedAt: feed.lastFetchedAt, fetchIntervalMinutes: feed.fetchIntervalMinutes }, new Date())) {
    return { inserted: 0, errorMessage: null };
  }

  const urlSafety = await deps.getExternalUrlSafety(feed.url);
  if (!urlSafety.safe) {
    const mapped = {
      errorMessage: `更新失败：${formatExternalUrlSafetyMessage(urlSafety, 'source')}`,
      rawErrorMessage: 'Unsafe URL',
    };
    await deps.recordFeedFetchResult(pool, feedId, {
      userId: feed.userId,
      status: null,
      error: mapped.errorMessage,
      rawError: mapped.rawErrorMessage,
    });
    return { inserted: 0, errorMessage: mapped.errorMessage };
  }

  const settings = await deps.getAppSettings(pool);
  const uiSettings = normalizePersistedSettings(await deps.getUiSettings(pool, feed.userId));
  const fetchedAt = new Date();

  let status: number | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let processedSuccessfully = false;
  let error: string | null = null;
  let rawError: string | null = null;
  let inserted = 0;

  try {
    const res = await deps.fetchFeedXml(feed.url, {
      timeoutMs: settings.rssTimeoutMs,
      userAgent: settings.rssUserAgent,
      etag: feed.etag,
      lastModified: feed.lastModified,
      userId: feed.userId,
    });
    status = res.status;
    etag = res.etag;
    lastModified = res.lastModified;

    if (status === 304) {
      processedSuccessfully = true;
      return { inserted: 0, errorMessage: null };
    }

    if (status < 200 || status >= 300) {
      const mapped = mapFeedFetchError(`HTTP ${status}`);
      error = mapped.errorMessage;
      rawError = mapped.rawErrorMessage;
      return { inserted: 0, errorMessage: mapped.errorMessage };
    }

    // 只有 304 可以不含正文；空响应不能作为已成功处理的 RSS 推进缓存标记。
    if (!res.xml) throw new Error('Empty RSS response');

    const parsed = await deps.parseFeed(res.xml, fetchedAt);
    const isPodcastSource = parsed.items.some((item) => item.mediaAttachments.length > 0);
    for (const item of parsed.items) {
      const baseUrl = item.link ?? parsed.link ?? feed.url;
      const client = await pool.connect();
      try {
        await client.query('begin');
        const created = await deps.insertArticleIgnoreDuplicate(client, {
          userId: feed.userId,
          feedId,
          dedupeKey: buildDedupeKey(item),
          title: item.title || '(untitled)',
          link: item.link,
          author: item.author,
          publishedAt: item.publishedAt.toISOString(),
          contentHtml: deps.sanitizeContent(item.contentHtml, { baseUrl }),
          previewImageUrl: item.previewImage,
          summary: item.summary,
          sourceLanguage: parsed.language,
          filterStatus: isPodcastSource ? 'passed' : 'pending',
          isFiltered: false,
          filteredBy: [],
          filterEvaluatedAt: isPodcastSource ? new Date().toISOString() : null,
          filterErrorMessage: null,
        });
        if (!created) {
          await client.query('commit');
          continue;
        }

        if (item.mediaAttachments.length > 0) {
          await deps.insertArticleMediaAttachments(client, created.id, item.mediaAttachments, feed.userId);
        }

        if (isPodcastSource) {
          await client.query('commit');
          inserted += 1;
          continue;
        }

        const filterJob: ArticleFilterJobData = {
          userId: feed.userId,
          articleId: created.id,
          articleFilter: uiSettings.rss.articleFilter,
          feed: {
            fullTextOnFetchEnabled: feed.fullTextOnFetchEnabled,
            aiSummaryOnFetchEnabled: feed.aiSummaryOnFetchEnabled,
            bodyTranslateOnFetchEnabled: feed.bodyTranslateOnFetchEnabled,
            titleTranslateEnabled: feed.titleTranslateEnabled,
          },
        };

        // 文章与过滤任务共用事务；入队失败时不留下无法再次补发的 pending 文章。
        const jobId = await boss.send(
          JOB_ARTICLE_FILTER,
          filterJob,
          {
            ...getQueueSendOptions(JOB_ARTICLE_FILTER, {
              userId: feed.userId,
              articleId: created.id,
            }),
            db: createQueueTransactionDb(client),
          },
        );
        // 新文章尚无历史过滤任务；返回 null 也不能视为任务已创建。
        if (!jobId) throw new Error('Article filter job was not created');
        await client.query('commit');
        inserted += 1;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }

    if (inserted > 0) {
      await deps.pruneFeedArticlesToLimit(
        pool,
        feedId,
        uiSettings.rss.maxStoredArticlesPerFeed,
        feed.userId,
      );
    }

    processedSuccessfully = true;
    return { inserted, errorMessage: null };
  } catch (err) {
    const mapped = mapFeedFetchError(err);
    error = mapped.errorMessage;
    rawError = mapped.rawErrorMessage;
    return { inserted: 0, errorMessage: mapped.errorMessage };
  } finally {
    await deps.recordFeedFetchResult(pool, feedId, {
      userId: feed?.userId ?? input?.userId,
      status,
      // 失败仍记录状态和错误，但保留上次成功处理的缓存标记供下次重试。
      ...(processedSuccessfully ? { etag, lastModified } : {}),
      error,
      rawError,
    });
  }
}

async function main() {
  const pool = getPool();
  const boss = await startBoss();

  await bootstrapQueues(boss);

  const refreshAllHandler = async (jobs: unknown[]) => {
    for (const job of jobs) {
      const data = getJobData(job);
      const force = readBooleanField(data, 'force') ?? false;
      const runId = readStringField(data, 'runId') ?? undefined;
      const userId = readStringField(data, 'userId');

      if (userId) {
        await enqueueRefreshAll(boss, { userId, force, runId });
        continue;
      }

      // 定时全量刷新没有会话上下文，必须按活跃用户逐个扫描。
      for (const activeUserId of await listActiveWorkerUserIds(pool)) {
        await enqueueRefreshAll(boss, { userId: activeUserId, force });
      }
    }
  };

  const feedFetchHandler = async (jobs: unknown[]) => {
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const feedId =
        readStringField(data, 'feedId');

      if (!feedId) throw new Error('Missing feedId');

      const force =
        typeof data === 'object' &&
        data !== null &&
        'force' in data &&
        typeof (data as { force?: unknown }).force === 'boolean'
          ? (data as { force: boolean }).force
          : false;
      const runId =
        readStringField(data, 'runId');
      const userId = readStringField(data, 'userId');

      if (runId) {
        await markFeedRefreshRunItemRunning(getPool(), {
          runId,
          userId: userId ?? undefined,
          feedId,
        });
      }

      const result = await fetchAndIngestFeed(boss, feedId, { userId: userId ?? undefined, force });

      if (runId) {
        await completeFeedRefreshRunItem(getPool(), {
          runId,
          userId: userId ?? undefined,
          feedId,
          status: result.errorMessage ? 'failed' : 'succeeded',
          errorMessage: result.errorMessage,
        });
      }
    }
  };

  const fulltextHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const articleId =
        readStringField(data, 'articleId');

      if (!articleId) throw new Error('Missing articleId');
      const userId = readStringField(data, 'userId');

      const jobId =
        typeof job === 'object' &&
        job !== null &&
        'id' in job &&
        (typeof (job as { id?: unknown }).id === 'string' ||
          typeof (job as { id?: unknown }).id === 'number')
          ? String((job as { id: string | number }).id)
          : null;

      await runArticleTaskWithStatus({
        pool,
        userId,
        articleId,
        type: 'fulltext',
        jobId,
        fn: async () => {
          await fetchFulltextAndStore(pool, articleId, userId);
          const after = await getArticleById(pool, articleId, userId ?? undefined);
          if (after?.contentFullError) {
            throw new Error(after.contentFullError);
          }
        },
      });
    }
  };

  const articleFilterHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      if (typeof data !== 'object' || data === null) {
        throw new Error('Missing article.filter job data');
      }

      const articleId =
        'articleId' in data && typeof (data as { articleId?: unknown }).articleId === 'string'
          ? (data as { articleId: string }).articleId
          : null;
      const userId =
        'userId' in data && typeof (data as { userId?: unknown }).userId === 'string'
          ? (data as { userId: string }).userId
          : null;
      const articleFilter =
        'articleFilter' in data && typeof (data as { articleFilter?: unknown }).articleFilter === 'object'
          ? (data as { articleFilter: ArticleFilterJobData['articleFilter'] }).articleFilter
          : null;
      const feed =
        'feed' in data && typeof (data as { feed?: unknown }).feed === 'object'
          ? (data as { feed: ArticleFilterJobData['feed'] }).feed
          : null;

      if (!articleId || !articleFilter || !feed) {
        throw new Error('Invalid article.filter job data');
      }

      await runArticleFilterWorker({
        pool,
        boss,
        job: { articleId, articleFilter, feed, ...(userId ? { userId } : {}) },
        judgeAi: async ({ prompt, articleText }) => {
          const uiSettings = normalizePersistedSettings(await getUiSettings(pool, userId ?? undefined));
          const apiKey = (await getAiApiKey(pool, userId ?? undefined)).trim();
          if (!apiKey) {
            return { ok: false, matched: false, errorMessage: 'Missing AI API key' };
          }

          const model = uiSettings.ai.model.trim() || DEFAULT_TRANSLATION_MODEL;
          const apiBaseUrl = uiSettings.ai.apiBaseUrl.trim() || DEFAULT_TRANSLATION_API_BASE_URL;
          return articleFilterJudge({
            apiBaseUrl,
            apiKey,
            model,
            prompt,
            articleText,
            deepThinkingEnabled: uiSettings.ai.deepThinkingEnabled,
          });
        },
      });
    }
  };

  const aiSummaryHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const articleId =
        readStringField(data, 'articleId');

      if (!articleId) throw new Error('Missing articleId');
      const userId = readStringField(data, 'userId');

      const sessionId =
        readStringField(data, 'sessionId');
      const sharedConfigFingerprint =
        readStringField(data, 'sharedConfigFingerprint');

      const jobId =
        typeof job === 'object' &&
        job !== null &&
        'id' in job &&
        (typeof (job as { id?: unknown }).id === 'string' ||
          typeof (job as { id?: unknown }).id === 'number')
          ? String((job as { id: string | number }).id)
          : null;

      await runAiSummaryStreamWorker({
        pool,
        userId,
        articleId,
        sessionId,
        jobId,
        sharedConfigFingerprint,
      });
    }
  };

  const aiTranslateHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const articleId =
        readStringField(data, 'articleId');

      if (!articleId) throw new Error('Missing articleId');
      const userId = readStringField(data, 'userId');

      const sessionId =
        readStringField(data, 'sessionId');
      const translationConfigFingerprint =
        readStringField(data, 'translationConfigFingerprint');

      const hasSegmentIndex =
        typeof data === 'object' && data !== null && 'segmentIndex' in data;
      const segmentIndexRaw =
        hasSegmentIndex && typeof data === 'object' && data !== null
          ? (data as { segmentIndex?: unknown }).segmentIndex
          : null;
      const segmentIndex =
        typeof segmentIndexRaw === 'number' &&
        Number.isInteger(segmentIndexRaw) &&
        segmentIndexRaw >= 0
          ? segmentIndexRaw
          : null;
      if (hasSegmentIndex && segmentIndex === null) {
        throw new Error('Invalid segmentIndex');
      }

      const jobId =
        typeof job === 'object' &&
        job !== null &&
        'id' in job &&
        (typeof (job as { id?: unknown }).id === 'string' ||
          typeof (job as { id?: unknown }).id === 'number')
          ? String((job as { id: string | number }).id)
          : null;

      await runArticleTaskWithStatus({
        pool,
        userId,
        articleId,
        type: 'ai_translate',
        jobId,
        userOperation: {
          actionKey:
            segmentIndex !== null
              ? 'article.aiTranslate.retrySegment'
              : 'article.aiTranslate.generate',
          source: 'worker/index',
          context: {
            articleId,
            ...(sessionId ? { sessionId } : {}),
            ...(segmentIndex !== null ? { segmentIndex } : {}),
            ...(jobId ? { jobId } : {}),
          },
        },
        fn: async () => {
          const article = await getArticleById(pool, articleId, userId ?? undefined);
          if (!article) return;

          const scopedUserId = article.userId;
          const ensureTranslationConfigCurrent = createConfigFingerprintGuard({
            initialFingerprint: translationConfigFingerprint,
            loadCurrentFingerprint: async () => {
              const [uiSettings, aiApiKey, translationApiKey] = await Promise.all([
                getUiSettings(pool, scopedUserId),
                getAiApiKey(pool, scopedUserId),
                getTranslationApiKey(pool, scopedUserId),
              ]);
              return resolveAiConfigFingerprints({
                settings: uiSettings,
                aiApiKey,
                translationApiKey,
              }).translation;
            },
          });

          const uiSettings = await getUiSettings(pool, scopedUserId);
          const normalizedSettings = normalizePersistedSettings(uiSettings);
          const aiApiKey = await getAiApiKey(pool, scopedUserId);
          const translationApiKey = await getTranslationApiKey(pool, scopedUserId);
          await ensureTranslationConfigCurrent();
          const resolved = resolveTranslationConfig({
            settings: normalizedSettings,
            aiApiKey,
            translationApiKey,
          });
          if (!resolved.apiKey.trim()) throw new Error('Missing translation API key');
          if (!isTranslationConfigComplete(resolved)) {
            throw new Error('Missing translation configuration');
          }
          const { model, apiBaseUrl, apiKey } = resolved;
          const deepThinkingEnabled = resolved.deepThinkingEnabled;

          await runImmersiveTranslateSession({
            pool,
            userId: scopedUserId,
            articleId,
            sessionId,
            segmentIndex,
            concurrency: 3,
            ensureSessionActive: ensureTranslationConfigCurrent,
            translateText: async ({ segmentIndex: currentSegmentIndex, sourceText }) => {
              await ensureTranslationConfigCurrent();
              const translated = await translateSegmentsInBatches({
                apiBaseUrl,
                apiKey,
                model,
                batchSize: 1,
                // 使用用户可配置翻译提示词；为空时在 AI 层自动回退默认提示词。
                prompt: normalizedSettings.ai.translationPrompt,
                deepThinkingEnabled,
                segments: [
                  {
                    id: `seg-${currentSegmentIndex}`,
                    tagName: 'p',
                    text: sourceText,
                  },
                ],
              });
              await ensureTranslationConfigCurrent();

              const translatedText = translated[0]?.translatedText?.trim() ?? '';
              if (!translatedText) {
                throw new Error('Invalid bilingual translation response: missing content');
              }
              return translatedText;
            },
          });
        },
      });
    }
  };

  const aiTitleTranslateHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data = getJobData(job);
      const articleId = readStringField(data, 'articleId');
      if (!articleId) throw new Error('Missing articleId');

      await runAiTitleTranslateWorker({
        pool,
        articleId,
        userId: readStringField(data, 'userId') ?? undefined,
      });
    }
  };

  const aiDigestTickHandler = async (jobs: unknown[]) => {
    for (const job of jobs) {
      const data = getJobData(job);
      const userId = readStringField(data, 'userId');
      const userIds = userId ? [userId] : await listActiveWorkerUserIds(pool);

      for (const activeUserId of userIds) {
        await runAiDigestTick({
          pool: getPool(),
          boss: {
            // Wrap `PgBoss.send` to avoid overload variance issues in Next.js typecheck.
            send: (name: string, data?: object | null, options?: unknown) =>
              // pg-boss types differ between builds; keep options loosely typed.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              boss.send(name, data, options as any),
          },
          now: new Date(),
          userId: activeUserId,
        });
      }
    }
  };

  const aiDigestGenerateHandler = async (jobs: unknown[]) => {
    const pool = getPool();
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const runId =
        readStringField(data, 'runId');
      const userId = readStringField(data, 'userId');
      const sharedConfigFingerprint =
        readStringField(data, 'sharedConfigFingerprint');

      if (!runId) throw new Error('Missing runId');

      const jobId =
        typeof job === 'object' &&
        job !== null &&
        'id' in job &&
        (typeof (job as { id?: unknown }).id === 'string' ||
          typeof (job as { id?: unknown }).id === 'number')
          ? String((job as { id: string | number }).id)
          : null;

      const retryCountRaw =
        typeof job === 'object' && job !== null
          ? (job as { retrycount?: unknown; retryCount?: unknown; retry_count?: unknown })
          : ({} as { retrycount?: unknown; retryCount?: unknown; retry_count?: unknown });
      const retryLimitRaw =
        typeof job === 'object' && job !== null
          ? (job as { retrylimit?: unknown; retryLimit?: unknown; retry_limit?: unknown })
          : ({} as { retrylimit?: unknown; retryLimit?: unknown; retry_limit?: unknown });

      const retryCountValue =
        typeof retryCountRaw.retrycount === 'number'
          ? retryCountRaw.retrycount
          : typeof retryCountRaw.retryCount === 'number'
            ? retryCountRaw.retryCount
            : typeof retryCountRaw.retry_count === 'number'
              ? retryCountRaw.retry_count
              : null;

      const retryLimitValue =
        typeof retryLimitRaw.retrylimit === 'number'
          ? retryLimitRaw.retrylimit
          : typeof retryLimitRaw.retryLimit === 'number'
            ? retryLimitRaw.retryLimit
            : typeof retryLimitRaw.retry_limit === 'number'
              ? retryLimitRaw.retry_limit
              : null;

      const isFinalAttempt =
        retryCountValue !== null && retryLimitValue !== null ? retryCountValue >= retryLimitValue : false;

      await runAiDigestGenerate({
        pool,
        userId,
        runId,
        jobId,
        isFinalAttempt,
        sharedConfigFingerprint,
        now: new Date(),
      });
    }
  };

  const systemLogCleanupHandler = async (jobs: unknown[]) => {
    void jobs;
    await runSystemLogCleanup({ pool: getPool() });
  };

  const feverSyncHandler = async (jobs: unknown[]) => {
    for (const job of jobs as Array<{ data?: { userId?: string; accountId?: string; runId?: string; feedIds?: string[] } }>) {
      const accountId = job.data?.accountId;
      if (!accountId) {
        continue;
      }

      const userId = typeof job.data?.userId === 'string' ? job.data.userId : null;
      const runId = typeof job.data?.runId === 'string' ? job.data.runId : null;
      const feedIds = Array.isArray(job.data?.feedIds)
        ? job.data.feedIds.filter((feedId): feedId is string => typeof feedId === 'string')
        : [];

      if (runId) {
        for (const feedId of feedIds) {
          await markFeedRefreshRunItemRunning(getPool(), {
            runId,
            userId: userId ?? undefined,
            feedId,
          });
        }
      }

      try {
        await runFeverSyncWorker({
          pool,
          boss,
          data: { userId: userId ?? undefined, accountId, runId, feedIds },
        });

        if (runId) {
          for (const feedId of feedIds) {
            await completeFeedRefreshRunItem(getPool(), {
              runId,
              userId: userId ?? undefined,
              feedId,
              status: 'succeeded',
              errorMessage: null,
            });
          }
        }
      } catch (error) {
        if (runId) {
          const errorMessage =
            error instanceof Error && error.message.trim() ? error.message : 'Fever 同步失败，请稍后重试';
          for (const feedId of feedIds) {
            await completeFeedRefreshRunItem(getPool(), {
              runId,
              userId: userId ?? undefined,
              feedId,
              status: 'failed',
              errorMessage,
            });
          }
        }
        throw error;
      }
    }
  };

  const feverAutoSyncHandler = async (jobs: unknown[]) => {
    for (const job of jobs) {
      const userId = readStringField(getJobData(job), 'userId');
      const userIds = userId ? [userId] : await listActiveWorkerUserIds(pool);

      for (const activeUserId of userIds) {
        await runFeverAutoSyncWorker({ pool, userId: activeUserId });
      }
    }
  };

  const lifecycle = createWorkerLifecycle({
    boss,
    pool,
    sampleStats: () => sampleQueueStats(boss, Object.keys(QUEUE_CONTRACTS)),
    stopHeartbeat: () => heartbeat.stop(),
  });
  const handlers = {
    [JOB_REFRESH_ALL]: refreshAllHandler,
    [JOB_AI_DIGEST_TICK]: aiDigestTickHandler,
    [JOB_AI_DIGEST_GENERATE]: aiDigestGenerateHandler,
    [JOB_FEVER_SYNC]: feverSyncHandler,
    [JOB_FEVER_SYNC_DUE]: feverAutoSyncHandler,
    [JOB_FEED_FETCH]: feedFetchHandler,
    [JOB_ARTICLE_FILTER]: articleFilterHandler,
    [JOB_ARTICLE_FILTER_RECOVER]: async () => {
      // 补偿独立于源站抓取和到期判断；即使持续返回 304，也能恢复历史遗漏的过滤任务。
      for (const userId of await listActiveWorkerUserIds(pool)) {
        await runArticleFilterRecovery({ pool, boss, userId });
      }
    },
    [JOB_ARTICLE_FULLTEXT_FETCH]: fulltextHandler,
    [JOB_AI_SUMMARIZE]: aiSummaryHandler,
    [JOB_AI_TRANSLATE]: aiTranslateHandler,
    [JOB_AI_TRANSLATE_TITLE]: aiTitleTranslateHandler,
    [JOB_SYSTEM_LOG_CLEANUP]: systemLogCleanupHandler,
  };
  // 所有业务回调都纳入退出等待，连接池关闭不能早于任务完成。
  await registerWorkers(boss, Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [name, lifecycle.trackHandler(handler)]),
  ));

  await boss.schedule(JOB_REFRESH_ALL, '* * * * *');
  await boss.send(JOB_REFRESH_ALL, {});
  await boss.schedule(JOB_AI_DIGEST_TICK, '* * * * *');
  await boss.send(JOB_AI_DIGEST_TICK, {});
  await boss.schedule(JOB_FEVER_SYNC_DUE, '* * * * *');
  await boss.send(JOB_FEVER_SYNC_DUE, {}, getQueueSendOptions(JOB_FEVER_SYNC_DUE, {}));
  await boss.schedule(JOB_ARTICLE_FILTER_RECOVER, '* * * * *');
  await boss.send(JOB_ARTICLE_FILTER_RECOVER, {}, getQueueSendOptions(JOB_ARTICLE_FILTER_RECOVER, {}));
  // Run cleanup hourly and trigger one immediate pass on worker boot.
  await boss.schedule(JOB_SYSTEM_LOG_CLEANUP, '0 * * * *');
  await boss.send(JOB_SYSTEM_LOG_CLEANUP, {});

  // 队列、消费回调和定时任务全部注册完成后，才向健康探测发布就绪状态。
  const heartbeat = await startWorkerHeartbeat(pool);

  const shutdown = () => {
    // 信号回调不能遗留未处理的 Promise 拒绝；清理失败应以非零状态退出。
    void lifecycle.shutdown().catch((error) => {
      console.error('[worker.shutdown.error]', error);
      process.exit(1);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isDirectRun = process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;

if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    // 启动失败时 pg-boss 可能已持有连接，必须结束进程让部署系统重启。
    process.exit(1);
  });
}
