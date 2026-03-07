import crypto from 'node:crypto';
import process from 'node:process';
import type { PgBoss } from 'pg-boss';
import { getPool } from '../server/db/pool';
import {
  getFeedForFetch,
  getFeedFullTextOnOpenEnabled,
  listEnabledFeedsForFetch,
  recordFeedFetchResult,
} from '../server/repositories/feedsRepo';
import {
  getArticleById,
  insertArticleIgnoreDuplicate,
  recordArticleTitleTranslationFailure,
  setArticleAiSummary,
  setArticleTitleTranslation,
} from '../server/repositories/articlesRepo';
import {
  getAiApiKey,
  getAppSettings,
  getTranslationApiKey,
  getUiSettings,
} from '../server/repositories/settingsRepo';
import { fetchFeedXml } from '../server/rss/fetchFeedXml';
import { parseFeed } from '../server/rss/parseFeed';
import { sanitizeContent } from '../server/rss/sanitizeContent';
import { isSafeExternalUrl } from '../server/rss/ssrfGuard';
import { fetchFulltextAndStore } from '../server/fulltext/fetchFulltextAndStore';
import { translateSegmentsInBatches } from '../server/ai/bilingualHtmlTranslator';
import { summarizeText } from '../server/ai/summarizeText';
import { translateTitle } from '../server/ai/translateTitle';
import { resolveTranslationConfig } from '../server/ai/translationConfig';
import { startBoss } from '../server/queue/boss';
import { bootstrapQueues } from '../server/queue/bootstrap';
import { QUEUE_CONTRACTS } from '../server/queue/contracts';
import {
  JOB_AI_SUMMARIZE,
  JOB_AI_TRANSLATE,
  JOB_AI_TRANSLATE_TITLE,
  JOB_ARTICLE_FULLTEXT_FETCH,
  JOB_FEED_FETCH,
  JOB_REFRESH_ALL,
} from '../server/queue/jobs';
import { sampleQueueStats } from '../server/queue/observability';
import { mapFeedFetchError } from '../server/tasks/feedFetchErrorMapping';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import { registerWorkers } from './workerRegistry';
import { buildFeedFetchJobData, selectFeedsForRefreshAll } from './refreshAll';
import { isFeedDue } from './rssScheduler';
import { runArticleTaskWithStatus } from './articleTaskStatus';
import { runImmersiveTranslateSession } from './immersiveTranslateWorker';
import { enqueueAutoAiTriggersOnFetch } from './autoAiTriggers';

const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_SUMMARY_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TRANSLATION_MODEL = 'gpt-4o-mini';
const DEFAULT_TRANSLATION_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TITLE_TRANSLATION_MODEL = 'gpt-4o-mini';
const DEFAULT_TITLE_TRANSLATION_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_SUMMARY_SOURCE_LENGTH = 16_000;

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

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function pickSummarySourceText(input: {
  contentFullHtml: string | null;
  contentHtml: string | null;
  summary: string | null;
}): string | null {
  const source = input.contentFullHtml ?? input.contentHtml ?? input.summary;
  if (!source) return null;

  const plain = htmlToPlainText(source);
  if (!plain) return null;

  if (plain.length <= MAX_SUMMARY_SOURCE_LENGTH) return plain;
  return plain.slice(0, MAX_SUMMARY_SOURCE_LENGTH);
}

async function enqueueRefreshAll(boss: PgBoss, input?: { force?: boolean }) {
  const pool = getPool();
  const feeds = await listEnabledFeedsForFetch(pool);
  const now = new Date();
  const force = Boolean(input?.force);
  const targetFeeds = selectFeedsForRefreshAll(feeds, now, { force });

  await Promise.all(
    targetFeeds.map((feed) => boss.send(JOB_FEED_FETCH, buildFeedFetchJobData(feed.id, { force }))),
  );
  return { enqueued: targetFeeds.length };
}

async function fetchAndIngestFeed(boss: PgBoss, feedId: string, input?: { force?: boolean }) {
  const pool = getPool();
  const feed = await getFeedForFetch(pool, feedId);
  if (!feed) return { inserted: 0 };

  if (!feed.enabled) return { inserted: 0 };

  const force = Boolean(input?.force);
  if (!force && !isFeedDue({ lastFetchedAt: feed.lastFetchedAt, fetchIntervalMinutes: feed.fetchIntervalMinutes }, new Date())) {
    return { inserted: 0 };
  }

  if (!(await isSafeExternalUrl(feed.url))) {
    await recordFeedFetchResult(pool, feedId, {
      status: null,
      error: mapFeedFetchError('Unsafe URL').errorMessage,
    });
    return { inserted: 0 };
  }

  const settings = await getAppSettings(pool);
  const fetchedAt = new Date();

  let status: number | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;
  let error: string | null = null;
  let inserted = 0;

  try {
    const res = await fetchFeedXml(feed.url, {
      timeoutMs: settings.rssTimeoutMs,
      userAgent: settings.rssUserAgent,
      etag: feed.etag,
      lastModified: feed.lastModified,
    });
    status = res.status;
    etag = res.etag;
    lastModified = res.lastModified;

    if (status === 304 || !res.xml) return { inserted: 0 };

    if (status < 200 || status >= 300) {
      error = mapFeedFetchError(`HTTP ${status}`).errorMessage;
      return { inserted: 0 };
    }

    const parsed = await parseFeed(res.xml, fetchedAt);
    for (const item of parsed.items) {
      const baseUrl = item.link ?? parsed.link ?? feed.url;
      const created = await insertArticleIgnoreDuplicate(pool, {
        feedId,
        dedupeKey: buildDedupeKey(item),
        title: item.title || '(untitled)',
        link: item.link,
        author: item.author,
        publishedAt: item.publishedAt.toISOString(),
        contentHtml: sanitizeContent(item.contentHtml, { baseUrl }),
        previewImageUrl: item.previewImage,
        summary: item.summary,
        sourceLanguage: parsed.language,
      });
      if (!created) continue;
      inserted += 1;

      if (feed.titleTranslateEnabled === true) {
        await boss.send(
          JOB_AI_TRANSLATE_TITLE,
          { articleId: created.id },
          {
            singletonKey: created.id,
            singletonSeconds: 600,
            retryLimit: 0,
          },
        );
      }

      await enqueueAutoAiTriggersOnFetch(boss, {
        feed: {
          aiSummaryOnFetchEnabled: feed.aiSummaryOnFetchEnabled,
          bodyTranslateOnFetchEnabled: feed.bodyTranslateOnFetchEnabled,
        },
        created,
      });
    }

    return { inserted };
  } catch (err) {
    error = mapFeedFetchError(err).errorMessage;
    return { inserted: 0 };
  } finally {
    await recordFeedFetchResult(pool, feedId, {
      status,
      etag,
      lastModified,
      error,
    });
  }
}

async function main() {
  const boss = await startBoss();

  await bootstrapQueues(boss);

  const refreshAllHandler = async (jobs: unknown[]) => {
    const force = jobs.some((job) => {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;
      if (typeof data !== 'object' || data === null) return false;
      if (!('force' in data)) return false;
      return (data as { force?: unknown }).force === true;
    });

    await enqueueRefreshAll(boss, { force });
  };

  const feedFetchHandler = async (jobs: unknown[]) => {
    for (const job of jobs) {
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const feedId =
        typeof data === 'object' &&
        data !== null &&
        'feedId' in data &&
        typeof (data as { feedId?: unknown }).feedId === 'string'
          ? (data as { feedId: string }).feedId
          : null;

      if (!feedId) throw new Error('Missing feedId');

      const force =
        typeof data === 'object' &&
        data !== null &&
        'force' in data &&
        typeof (data as { force?: unknown }).force === 'boolean'
          ? (data as { force: boolean }).force
          : false;

      await fetchAndIngestFeed(boss, feedId, { force });
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
        typeof data === 'object' &&
        data !== null &&
        'articleId' in data &&
        typeof (data as { articleId?: unknown }).articleId === 'string'
          ? (data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

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
        articleId,
        type: 'fulltext',
        jobId,
        fn: async () => {
          await fetchFulltextAndStore(pool, articleId);
          const after = await getArticleById(pool, articleId);
          if (after?.contentFullError) {
            throw new Error(after.contentFullError);
          }
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
        typeof data === 'object' &&
        data !== null &&
        'articleId' in data &&
        typeof (data as { articleId?: unknown }).articleId === 'string'
          ? (data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

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
        articleId,
        type: 'ai_summary',
        jobId,
        fn: async () => {
          const article = await getArticleById(pool, articleId);
          if (!article) return;
          if (article.aiSummary?.trim()) return;

          const aiApiKey = await getAiApiKey(pool);
          if (!aiApiKey.trim()) throw new Error('Missing AI API key');

          const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
          if (
            fullTextOnOpenEnabled === true &&
            !article.contentFullHtml &&
            !article.contentFullError
          ) {
            throw new Error('Fulltext pending');
          }

          const sourceText = pickSummarySourceText({
            contentFullHtml: article.contentFullHtml,
            contentHtml: article.contentHtml,
            summary: article.summary,
          });
          if (!sourceText) throw new Error('Missing article content');

          const uiSettings = await getUiSettings(pool);
          const normalizedSettings = normalizePersistedSettings(uiSettings);
          const model = normalizedSettings.ai.model.trim() || DEFAULT_SUMMARY_MODEL;
          const apiBaseUrl = normalizedSettings.ai.apiBaseUrl.trim() || DEFAULT_SUMMARY_API_BASE_URL;

          const aiSummary = await summarizeText({
            apiBaseUrl,
            apiKey: aiApiKey,
            model,
            text: sourceText,
          });

          await setArticleAiSummary(pool, articleId, { aiSummary, aiSummaryModel: model });
        },
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
        typeof data === 'object' &&
        data !== null &&
        'articleId' in data &&
        typeof (data as { articleId?: unknown }).articleId === 'string'
          ? (data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

      const sessionId =
        typeof data === 'object' &&
        data !== null &&
        'sessionId' in data &&
        typeof (data as { sessionId?: unknown }).sessionId === 'string'
          ? (data as { sessionId: string }).sessionId
          : null;

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
        articleId,
        type: 'ai_translate',
        jobId,
        fn: async () => {
          const article = await getArticleById(pool, articleId);
          if (!article) return;

          const uiSettings = await getUiSettings(pool);
          const normalizedSettings = normalizePersistedSettings(uiSettings);
          const aiApiKey = await getAiApiKey(pool);
          const translationApiKey = await getTranslationApiKey(pool);
          const resolved = resolveTranslationConfig({
            settings: normalizedSettings,
            aiApiKey,
            translationApiKey,
          });
          const model = resolved.model || DEFAULT_TRANSLATION_MODEL;
          const apiBaseUrl = resolved.apiBaseUrl || DEFAULT_TRANSLATION_API_BASE_URL;
          const apiKey = resolved.apiKey.trim();
          if (!apiKey) throw new Error('Missing translation API key');

          await runImmersiveTranslateSession({
            pool,
            articleId,
            sessionId,
            segmentIndex,
            concurrency: 3,
            translateText: async ({ segmentIndex: currentSegmentIndex, sourceText }) => {
              const translated = await translateSegmentsInBatches({
                apiBaseUrl,
                apiKey,
                model,
                batchSize: 1,
                segments: [
                  {
                    id: `seg-${currentSegmentIndex}`,
                    tagName: 'p',
                    text: sourceText,
                  },
                ],
              });

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
      const data =
        typeof job === 'object' && job !== null && 'data' in job
          ? (job as { data?: unknown }).data
          : null;

      const articleId =
        typeof data === 'object' &&
        data !== null &&
        'articleId' in data &&
        typeof (data as { articleId?: unknown }).articleId === 'string'
          ? (data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

      const article = await getArticleById(pool, articleId);
      if (!article) continue;
      if (article.titleZh?.trim()) continue;

      const titleSource = (article.titleOriginal || article.title).trim();
      if (!titleSource) continue;

      const uiSettings = await getUiSettings(pool);
      const normalizedSettings = normalizePersistedSettings(uiSettings);
      const aiApiKey = await getAiApiKey(pool);
      const translationApiKey = await getTranslationApiKey(pool);
      const resolved = resolveTranslationConfig({
        settings: normalizedSettings,
        aiApiKey,
        translationApiKey,
      });
      const model = resolved.model || DEFAULT_TITLE_TRANSLATION_MODEL;
      const apiBaseUrl = resolved.apiBaseUrl || DEFAULT_TITLE_TRANSLATION_API_BASE_URL;
      const apiKey = resolved.apiKey.trim();
      if (!apiKey) continue;

      try {
        const translatedTitle = await translateTitle({
          apiBaseUrl,
          apiKey,
          model,
          title: titleSource,
        });
        if (!translatedTitle.trim()) {
          throw new Error('Invalid title translation: empty result');
        }

        await setArticleTitleTranslation(pool, articleId, {
          titleZh: translatedTitle.trim(),
          titleTranslationModel: model,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown title translation error';
        const attempts = await recordArticleTitleTranslationFailure(pool, articleId, { error: message });
        if (attempts < 3) {
          throw err instanceof Error ? err : new Error(message);
        }
      }
    }
  };

  await registerWorkers(boss, {
    [JOB_REFRESH_ALL]: refreshAllHandler,
    [JOB_FEED_FETCH]: feedFetchHandler,
    [JOB_ARTICLE_FULLTEXT_FETCH]: fulltextHandler,
    [JOB_AI_SUMMARIZE]: aiSummaryHandler,
    [JOB_AI_TRANSLATE]: aiTranslateHandler,
    [JOB_AI_TRANSLATE_TITLE]: aiTitleTranslateHandler,
  });

  const queueNames = Object.keys(QUEUE_CONTRACTS);
  const statsTimer = setInterval(() => {
    void sampleQueueStats(boss, queueNames).catch((err) => {
      console.warn('[pgboss.stats.error]', err);
    });
  }, 60_000);
  statsTimer.unref?.();

  await boss.schedule(JOB_REFRESH_ALL, '* * * * *');
  await boss.send(JOB_REFRESH_ALL, {});

  const shutdown = async () => {
    await boss.stop();
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
