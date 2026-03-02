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
  setArticleAiSummary,
  setArticleAiTranslationZh,
} from '../server/repositories/articlesRepo';
import { getAiApiKey, getAppSettings, getUiSettings } from '../server/repositories/settingsRepo';
import { fetchFeedXml } from '../server/rss/fetchFeedXml';
import { parseFeed } from '../server/rss/parseFeed';
import { sanitizeContent } from '../server/rss/sanitizeContent';
import { isSafeExternalUrl } from '../server/rss/ssrfGuard';
import { fetchFulltextAndStore } from '../server/fulltext/fetchFulltextAndStore';
import { summarizeText } from '../server/ai/summarizeText';
import { translateHtml } from '../server/ai/translateHtml';
import { startBoss } from '../server/queue/boss';
import {
  JOB_AI_SUMMARIZE,
  JOB_AI_TRANSLATE,
  JOB_ARTICLE_FULLTEXT_FETCH,
  JOB_FEED_FETCH,
  JOB_REFRESH_ALL,
} from '../server/queue/jobs';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import { buildFeedFetchJobData, selectFeedsForRefreshAll } from './refreshAll';
import { isFeedDue } from './rssScheduler';

const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_SUMMARY_API_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_TRANSLATION_MODEL = 'gpt-4o-mini';
const DEFAULT_TRANSLATION_API_BASE_URL = 'https://api.openai.com/v1';
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

async function fetchAndIngestFeed(feedId: string, input?: { force?: boolean }) {
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
      error: 'Unsafe URL',
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
      error = `HTTP ${status}`;
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
      });
      if (created) inserted += 1;
    }

    return { inserted };
  } catch (err) {
    error = err instanceof Error ? err.message : 'Unknown error';
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

  await boss.createQueue(JOB_REFRESH_ALL);
  await boss.createQueue(JOB_FEED_FETCH);
  await boss.createQueue(JOB_ARTICLE_FULLTEXT_FETCH);
  await boss.createQueue(JOB_AI_SUMMARIZE);
  await boss.createQueue(JOB_AI_TRANSLATE);

  await boss.work(JOB_REFRESH_ALL, async (jobs) => {
    const force = jobs.some((job) => {
      if (typeof job.data !== 'object' || job.data === null) return false;
      if (!('force' in job.data)) return false;
      return (job.data as { force?: unknown }).force === true;
    });

    await enqueueRefreshAll(boss, { force });
  });

  await boss.work(JOB_FEED_FETCH, async (jobs) => {
    for (const job of jobs) {
      const feedId =
        typeof job.data === 'object' &&
        job.data !== null &&
        'feedId' in job.data &&
        typeof (job.data as { feedId?: unknown }).feedId === 'string'
          ? (job.data as { feedId: string }).feedId
          : null;

      if (!feedId) throw new Error('Missing feedId');

      const force =
        typeof job.data === 'object' &&
        job.data !== null &&
        'force' in job.data &&
        typeof (job.data as { force?: unknown }).force === 'boolean'
          ? (job.data as { force: boolean }).force
          : false;

      await fetchAndIngestFeed(feedId, { force });
    }
  });

  await boss.work(JOB_ARTICLE_FULLTEXT_FETCH, async (jobs) => {
    const pool = getPool();
    for (const job of jobs) {
      const articleId =
        typeof job.data === 'object' &&
        job.data !== null &&
        'articleId' in job.data &&
        typeof (job.data as { articleId?: unknown }).articleId === 'string'
          ? (job.data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');
      await fetchFulltextAndStore(pool, articleId);
    }
  });

  await boss.work(JOB_AI_SUMMARIZE, async (jobs) => {
    const pool = getPool();
    for (const job of jobs) {
      const articleId =
        typeof job.data === 'object' &&
        job.data !== null &&
        'articleId' in job.data &&
        typeof (job.data as { articleId?: unknown }).articleId === 'string'
          ? (job.data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

      const article = await getArticleById(pool, articleId);
      if (!article) continue;
      if (article.aiSummary?.trim()) continue;

      const aiApiKey = await getAiApiKey(pool);
      if (!aiApiKey.trim()) continue;

      const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
      if (fullTextOnOpenEnabled === true && !article.contentFullHtml && !article.contentFullError) {
        throw new Error('Fulltext pending');
      }

      const sourceText = pickSummarySourceText({
        contentFullHtml: article.contentFullHtml,
        contentHtml: article.contentHtml,
        summary: article.summary,
      });
      if (!sourceText) continue;

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
    }
  });

  await boss.work(JOB_AI_TRANSLATE, async (jobs) => {
    const pool = getPool();
    for (const job of jobs) {
      const articleId =
        typeof job.data === 'object' &&
        job.data !== null &&
        'articleId' in job.data &&
        typeof (job.data as { articleId?: unknown }).articleId === 'string'
          ? (job.data as { articleId: string }).articleId
          : null;

      if (!articleId) throw new Error('Missing articleId');

      const article = await getArticleById(pool, articleId);
      if (!article) continue;
      if (article.aiTranslationZhHtml?.trim()) continue;

      const aiApiKey = await getAiApiKey(pool);
      if (!aiApiKey.trim()) continue;

      const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
      if (fullTextOnOpenEnabled === true && !article.contentFullHtml && !article.contentFullError) {
        throw new Error('Fulltext pending');
      }

      const htmlSource = article.contentFullHtml ?? article.contentHtml;
      if (!htmlSource?.trim()) continue;

      const uiSettings = await getUiSettings(pool);
      const normalizedSettings = normalizePersistedSettings(uiSettings);
      const model = normalizedSettings.ai.model.trim() || DEFAULT_TRANSLATION_MODEL;
      const apiBaseUrl = normalizedSettings.ai.apiBaseUrl.trim() || DEFAULT_TRANSLATION_API_BASE_URL;

      const translated = await translateHtml({
        apiBaseUrl,
        apiKey: aiApiKey,
        model,
        html: htmlSource,
      });

      const baseUrl = article.contentFullSourceUrl ?? article.link ?? null;
      const sanitized = sanitizeContent(translated, baseUrl ? { baseUrl } : undefined);
      if (!sanitized) {
        throw new Error('Invalid translation: empty result after sanitize');
      }

      await setArticleAiTranslationZh(pool, articleId, {
        aiTranslationZhHtml: sanitized,
        aiTranslationModel: model,
      });
    }
  });

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
