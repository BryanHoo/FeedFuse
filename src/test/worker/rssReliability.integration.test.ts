import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFeedFetchHandler, fetchAndIngestFeed } from '@/worker/index';
import { registerWorkers } from '@/worker/workerRegistry';
import { runArticleFilterRecovery } from '@/worker/articleFilterRecovery';
import { insertArticleIgnoreDuplicate, insertArticleMediaAttachments } from '@/server/domains/articles/repositories/articlesRepo';
import { listPendingArticleFilterIds } from '@/server/domains/articles/repositories/articleFilterRecoveryRepo';
import { JOB_ARTICLE_FILTER, JOB_FEED_FETCH } from '@/server/infra/queue/jobs';
import { getQueueCreateOptions } from '@/server/infra/queue/contracts';

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('RSS reliability (isolated PostgreSQL and pg-boss)', () => {
  const prefix = `rss_reliability_${randomBytes(6).toString('hex')}`;
  const queueSchema = `${prefix}_jobs`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${prefix},public` });
  const boss = new PgBoss({ connectionString: databaseUrl, schema: queueSchema, supervise: false, schedule: false });
  let feedId: string;

  beforeAll(async () => {
    // 只复制表结构到随机隔离 schema；identity 序列也独立，测试不读写用户业务数据。
    await admin.query(`create schema ${prefix}`);
    for (const table of ['feeds', 'articles', 'article_media_attachments']) {
      await admin.query(`create table ${prefix}.${table} (like public.${table} including all)`);
    }
    await boss.start();
    await boss.createQueue(JOB_ARTICLE_FILTER);
    await boss.createQueue('dlq.feed.fetch');
    await boss.createQueue(JOB_FEED_FETCH, getQueueCreateOptions(JOB_FEED_FETCH));
  }, 20000);

  beforeEach(async () => {
    await pool.query('truncate articles, article_media_attachments, feeds restart identity');
    await boss.deleteAllJobs(JOB_ARTICLE_FILTER);
    await boss.deleteAllJobs(JOB_FEED_FETCH);
    await boss.deleteAllJobs('dlq.feed.fetch');
    const { rows } = await pool.query(`
      insert into feeds(user_id, title, url, etag, last_modified)
      values (1, 'Test', 'https://example.com/rss', 'old-etag', 'old-modified') returning id::text
    `);
    feedId = rows[0].id;
  });

  afterAll(async () => {
    await boss.stop({ graceful: true, timeout: 5000 });
    await pool.end();
    await admin.query(`drop schema if exists ${queueSchema} cascade`);
    await admin.query(`drop schema if exists ${prefix} cascade`);
    await admin.end();
  });

  function ingestionDeps() {
    return {
      getPool: () => pool,
      getExternalUrlSafety: vi.fn().mockResolvedValue({ safe: true }),
      getAppSettings: vi.fn().mockResolvedValue({ rssTimeoutMs: 10000, rssUserAgent: 'test' }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      isFeedDue: () => true,
      fetchFeedXml: vi.fn().mockResolvedValue({ status: 200, xml: '<rss />', etag: 'new-etag', lastModified: 'new-modified' }),
      parseFeed: vi.fn().mockResolvedValue({ link: null, language: null, items: [{
        guid: 'item-1', link: 'https://example.com/article', title: 'Article', author: null,
        publishedAt: new Date('2026-01-01'), contentHtml: '<p>Body</p>',
        previewImage: null, summary: null, mediaAttachments: [],
      }] }),
      pruneFeedArticlesToLimit: vi.fn(),
    };
  }

  async function validators() {
    return (await pool.query('select etag, last_modified from feeds where id = $1', [feedId])).rows[0];
  }

  it.each(['recover', 'exhaust'])('retries actual Worker callbacks and settles only the final %s outcome', async (outcome) => {
    const deps = ingestionDeps();
    const failure = new Error('timeout');
    if (outcome === 'recover') deps.fetchFeedXml.mockRejectedValueOnce(failure);
    else deps.fetchFeedXml.mockRejectedValue(failure);
    const complete = vi.fn();
    const handler = createFeedFetchHandler(boss, { deps: {
      getPool: () => pool,
      fetchAndIngestFeed: (queue, id, input) => fetchAndIngestFeed(queue, id, { ...input, deps }),
      markFeedRefreshRunItemRunning: vi.fn(),
      completeFeedRefreshRunItem: complete,
    } });
    await registerWorkers(boss, { [JOB_FEED_FETCH]: handler });
    try {
      // 队列契约允许四次重试，当前任务覆盖为一次；终态必须服从真实任务元数据。
      const id = await boss.send(JOB_FEED_FETCH, { feedId, userId: '1', runId: 'test-run' }, {
        retryLimit: 1, retryDelay: 1, retryBackoff: true,
      });
      await vi.waitFor(async () => {
        expect((await boss.getJobById(JOB_FEED_FETCH, id!))?.state).toBe('retry');
      }, { timeout: 10000, interval: 20 });
      expect(complete).not.toHaveBeenCalled();
      const pendingFeed = (await pool.query('select last_fetched_at, last_fetch_error from feeds where id = $1', [feedId])).rows[0];
      expect(pendingFeed).toEqual({ last_fetched_at: null, last_fetch_error: null });

      const state = outcome === 'recover' ? 'completed' : 'failed';
      await vi.waitFor(async () => {
        const job = await boss.getJobById(JOB_FEED_FETCH, id!);
        expect(job).toMatchObject({ state, retryCount: 1, retryLimit: 1 });
      }, { timeout: 10000, interval: 20 });
      expect(deps.fetchFeedXml).toHaveBeenCalledTimes(2);
      expect(complete).toHaveBeenCalledOnce();
      expect(complete).toHaveBeenCalledWith(pool, expect.objectContaining({
        status: outcome === 'recover' ? 'succeeded' : 'failed',
      }));
      expect(await boss.findJobs('dlq.feed.fetch')).toHaveLength(outcome === 'recover' ? 0 : 1);
      const feed = (await pool.query('select last_fetched_at, last_fetch_error from feeds where id = $1', [feedId])).rows[0];
      expect(feed.last_fetched_at).toBeInstanceOf(Date);
      expect(feed.last_fetch_error).toBe(outcome === 'recover' ? null : '更新失败：请求超时，请稍后重试');
    } finally {
      await boss.offWork(JOB_FEED_FETCH);
    }
  }, 25000);

  it('rolls back both article and actual pg-boss job after enqueue SQL, then successfully retries', async () => {
    const deps = ingestionDeps();
    const failingBoss = { send: async (...args: Parameters<PgBoss['send']>) => {
      await boss.send(...args);
      throw new Error('Injected failure after queue insert');
    } };
    await expect(fetchAndIngestFeed(failingBoss as PgBoss, feedId, { deps })).rejects.toThrow('Injected failure after queue insert');
    expect((await pool.query('select count(*)::int as count from articles')).rows[0].count).toBe(0);
    expect(await boss.findJobs(JOB_ARTICLE_FILTER)).toHaveLength(0);
    expect(await validators()).toEqual({ etag: 'old-etag', last_modified: 'old-modified' });

    expect(await fetchAndIngestFeed(boss, feedId, { deps })).toEqual({ inserted: 1, errorMessage: null });
    expect(await boss.findJobs(JOB_ARTICLE_FILTER)).toHaveLength(1);
    expect(await validators()).toEqual({ etag: 'new-etag', last_modified: 'new-modified' });
  });

  it('reuses old validators after parse failure and processes the unchanged body on retry', async () => {
    const deps = ingestionDeps();
    deps.parseFeed.mockRejectedValueOnce(new Error('Injected XML parse failure'));
    expect((await fetchAndIngestFeed(boss, feedId, { deps })).errorMessage).toBeTruthy();
    expect(await validators()).toEqual({ etag: 'old-etag', last_modified: 'old-modified' });
    expect(await fetchAndIngestFeed(boss, feedId, { deps })).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.fetchFeedXml.mock.calls[1][1]).toMatchObject({ etag: 'old-etag', lastModified: 'old-modified' });
  });

  it('recovers an orphan after a 304 and prevents duplicate sends across concurrent scans', async () => {
    const article = await insertArticleIgnoreDuplicate(pool, { userId: '1', feedId, dedupeKey: 'orphan', title: 'Orphan', filterStatus: 'pending' });
    const deps = ingestionDeps();
    deps.fetchFeedXml.mockResolvedValue({ status: 304, xml: null, etag: 'old-etag', lastModified: 'old-modified' });
    expect(await fetchAndIngestFeed(boss, feedId, { deps })).toEqual({ inserted: 0, errorMessage: null });
    const recover = () => runArticleFilterRecovery({ pool, boss, userId: '1', deps: { getUiSettings: deps.getUiSettings } });
    expect((await Promise.all([recover(), recover()])).reduce((sum, count) => sum + count, 0)).toBe(1);
    const jobs = await boss.findJobs(JOB_ARTICLE_FILTER);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data).toMatchObject({ userId: '1', articleId: String(article!.id) });
    expect(await recover()).toBe(0);
  });

  it('limits recovery to the user and local text RSS pending articles, with keyset pagination', async () => {
    const add = (dedupeKey: string, userId = '1', filterStatus = 'pending') => insertArticleIgnoreDuplicate(pool, {
      userId, feedId, dedupeKey, title: dedupeKey, filterStatus: filterStatus as 'pending' | 'passed',
    });
    const first = await add('first');
    await add('passed', '1', 'passed');
    await add('other-user', '2');
    const podcast = await add('podcast');
    await insertArticleMediaAttachments(pool, String(podcast!.id), [{
      url: 'https://example.com/audio.mp3', mimeType: 'audio/mpeg', sizeBytes: null, durationSeconds: null,
    }], '1');
    const last = await add('last');
    expect(await listPendingArticleFilterIds(pool, { userId: '1', afterId: null, limit: 1 })).toEqual([String(first!.id)]);
    expect(await listPendingArticleFilterIds(pool, { userId: '1', afterId: String(first!.id), limit: 100 })).toEqual([String(last!.id)]);
    await pool.query("update feeds set provider = 'fever' where id = $1", [feedId]);
    expect(await listPendingArticleFilterIds(pool, { userId: '1', afterId: null, limit: 100 })).toEqual([]);
  });
});
