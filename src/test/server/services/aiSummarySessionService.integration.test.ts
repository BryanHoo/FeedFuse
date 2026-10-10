import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueAiSummarySession } from '@/server/domains/articles/services/aiSummarySessionService';
import {
  completeAiSummarySession,
  failAiSummarySession,
  getAiSummarySessionById,
  markAiSummarySessionSuperseded,
  updateAiSummarySessionDraft,
  upsertAiSummarySession,
} from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import {
  getArticleTasksByArticleId,
  upsertTaskFailed,
  upsertTaskQueued,
  upsertTaskRunning,
  upsertTaskSucceeded,
} from '@/server/domains/articles/repositories/articleTasksRepo';
import { JOB_AI_SUMMARIZE } from '@/server/infra/queue/jobs';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';

const holder = vi.hoisted(() => ({ boss: null as PgBoss | null }));
vi.mock('@/server/infra/queue/boss', () => ({ startBoss: async () => holder.boss }));
vi.mock('@/server/infra/logging/userOperationLogger', () => ({ writeUserOperationStartedLog: async () => {} }));

const databaseUrl = process.env.DATABASE_URL;

describe.skipIf(!databaseUrl)('AI summary races (isolated PostgreSQL and actual pg-boss)', () => {
  const schema = `summary_races_${randomBytes(6).toString('hex')}`;
  const queueSchema = `${schema}_jobs`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema},public` });
  const boss = new PgBoss({ connectionString: databaseUrl, schema: queueSchema, supervise: false, schedule: false });
  let articleId: string;

  beforeAll(async () => {
    // 业务表与队列表都放在随机 schema 中，只复制结构，避免读写现有用户数据。
    await admin.query(`create schema ${schema}`);
    for (const table of ['feeds', 'articles', 'article_tasks', 'article_ai_summary_sessions']) {
      await admin.query(`create table ${schema}.${table} (like public.${table} including all)`);
    }
    await boss.start();
    holder.boss = boss;
  }, 20000);

  beforeEach(async () => {
    await pool.query('truncate articles, feeds, article_tasks, article_ai_summary_sessions restart identity');
    await boss.deleteAllJobs(JOB_AI_SUMMARIZE).catch(() => {});
    const feed = await pool.query("insert into feeds(user_id, title, url) values (1, 'Test', 'https://example.com/feed') returning id");
    const article = await pool.query("insert into articles(user_id, feed_id, dedupe_key, title) values (1, $1, 'test', 'Test') returning id::text", [feed.rows[0].id]);
    articleId = article.rows[0].id;
  });

  afterAll(async () => {
    await boss.stop({ graceful: true, timeout: 5000 });
    await pool.end();
    await admin.query(`drop schema if exists ${queueSchema} cascade`);
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });

  const enqueue = () => enqueueAiSummarySession({
    pool, userId: '1', articleId, sourceTextHash: 'hash', sharedConfigFingerprint: 'config', force: true,
  });
  const sessionCount = async () => (await pool.query('select count(*)::int as count from article_ai_summary_sessions')).rows[0].count;

  it('rolls back an actual queue insert and preserves the previous session on enqueue failure', async () => {
    const previous = await upsertAiSummarySession(pool, { userId: '1', articleId, sourceTextHash: 'old', status: 'succeeded', draftText: 'old' });
    const originalSend = boss.send.bind(boss);
    const spy = vi.spyOn(boss, 'send').mockImplementation(async (...args: Parameters<PgBoss['send']>) => {
      await originalSend(...args);
      throw new Error('failure after actual queue insert');
    });
    try {
      await expect(enqueue()).rejects.toThrow('failure after actual queue insert');
      expect(await sessionCount()).toBe(1);
      expect((await getAiSummarySessionById(pool, previous.id, '1'))?.supersededBySessionId).toBeNull();
      expect(await getArticleTasksByArticleId(pool, articleId, '1')).toHaveLength(0);
      expect(await boss.findJobs(JOB_AI_SUMMARIZE)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
    expect((await enqueue()).enqueued).toBe(true);
  });

  it('rolls back when business task insertion fails after queue insertion', async () => {
    // 在真实 SQL 边界注入故障，验证事务能同时撤销会话、任务和 pg-boss 记录。
    await pool.query(`create function reject_task() returns trigger language plpgsql as $$ begin raise exception 'task failure'; end $$`);
    await pool.query('create trigger reject_task before insert on article_tasks for each row execute function reject_task()');
    try {
      await expect(enqueue()).rejects.toThrow('task failure');
      expect(await sessionCount()).toBe(0);
      expect(await boss.findJobs(JOB_AI_SUMMARIZE)).toHaveLength(0);
    } finally {
      await pool.query('drop trigger reject_task on article_tasks');
      await pool.query('drop function reject_task()');
    }
    expect((await enqueue()).enqueued).toBe(true);
  });

  it('does not publish a new session when actual pg-boss throttling rejects the send', async () => {
    const previous = await upsertAiSummarySession(pool, { userId: '1', articleId, sourceTextHash: 'old', status: 'failed', draftText: 'old' });
    await boss.send(JOB_AI_SUMMARIZE, { userId: '1', articleId }, getQueueSendOptions(JOB_AI_SUMMARIZE, { userId: '1', articleId }));
    expect(await enqueue()).toEqual({ enqueued: false, reason: 'already_enqueued', sessionId: previous.id });
    expect(await sessionCount()).toBe(1);
    expect((await getAiSummarySessionById(pool, previous.id, '1'))?.supersededBySessionId).toBeNull();
    expect(await getArticleTasksByArticleId(pool, articleId, '1')).toHaveLength(0);
  });

  it('keeps the job invisible to an independent worker until session and task commit', async () => {
    let reachSend!: () => void;
    let releaseSend!: () => void;
    const reached = new Promise<void>((resolve) => { reachSend = resolve; });
    const released = new Promise<void>((resolve) => { releaseSend = resolve; });
    const originalSend = boss.send.bind(boss);
    const spy = vi.spyOn(boss, 'send').mockImplementation(async (...args: Parameters<PgBoss['send']>) => {
      const id = await originalSend(...args);
      reachSend();
      await released;
      return id;
    });
    const pending = enqueue();
    try {
      await reached;
      expect(await boss.fetch(JOB_AI_SUMMARIZE)).toHaveLength(0);
      expect(await sessionCount()).toBe(0);
      expect(await getArticleTasksByArticleId(pool, articleId, '1')).toHaveLength(0);
    } finally {
      releaseSend();
      spy.mockRestore();
    }
    const result = await pending;
    if (!result.enqueued) throw new Error('expected queued result');
    const jobs = await boss.fetch<{ sessionId: string }>(JOB_AI_SUMMARIZE);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.sessionId).toBe(result.sessionId);
    expect((await getAiSummarySessionById(pool, result.sessionId, '1'))?.jobId).toBe(result.jobId);
    expect((await getArticleTasksByArticleId(pool, articleId, '1'))[0]).toMatchObject({ status: 'queued', jobId: result.jobId });
  });

  it('serializes simultaneous requests and recovers a queued orphan', async () => {
    const orphan = await upsertAiSummarySession(pool, { userId: '1', articleId, sourceTextHash: 'hash', status: 'queued', draftText: '' });
    const results = await Promise.all([enqueue(), enqueue()]);
    expect(results.filter((result) => result.enqueued)).toHaveLength(1);
    expect(await sessionCount()).toBe(2);
    expect(await boss.findJobs(JOB_AI_SUMMARIZE)).toHaveLength(1);
    expect(await getArticleTasksByArticleId(pool, articleId, '1')).toHaveLength(1);
    expect((await getAiSummarySessionById(pool, orphan.id, '1'))?.supersededBySessionId).toBeTruthy();
  });

  it('lets a new automatic job retry a terminal task without taking over an active job', async () => {
    const old = { userId: '1', articleId, type: 'ai_summary' as const, jobId: 'old-auto-job' };
    await upsertTaskQueued(pool, old);
    await upsertTaskFailed(pool, { ...old, errorCode: 'failed', errorMessage: 'failed', rawErrorMessage: null });
    const newer = { ...old, jobId: 'new-auto-job', allowNewJob: true };
    expect(await upsertTaskRunning(pool, newer)).toBe(true);
    expect(await upsertTaskRunning(pool, { ...old, allowNewJob: true })).toBe(false);
    expect((await getArticleTasksByArticleId(pool, articleId, '1'))[0]).toMatchObject({ status: 'running', jobId: 'new-auto-job' });
  });

  it('rejects old job IDs and late writes after success or supersession', async () => {
    const result = await enqueue();
    if (!result.enqueued) throw new Error('expected queued result');
    const task = { userId: '1', articleId, type: 'ai_summary' as const, jobId: result.jobId };
    const session = { userId: '1', articleId, sessionId: result.sessionId, sourceTextHash: 'hash', status: 'running' as const, draftText: '', jobId: result.jobId };
    expect(await upsertTaskRunning(pool, { ...task, jobId: 'old-job' })).toBe(false);
    expect(await upsertAiSummarySession(pool, { ...session, jobId: 'old-job' })).toBeNull();
    expect(await upsertTaskRunning(pool, task)).toBe(true);
    expect(await upsertAiSummarySession(pool, session)).not.toBeNull();
    expect(await completeAiSummarySession(pool, { ...session, finalText: 'result', model: 'test' })).not.toBeNull();
    expect(await upsertTaskSucceeded(pool, task)).toBe(true);
    expect(await upsertAiSummarySession(pool, session)).toBeNull();
    expect(await updateAiSummarySessionDraft(pool, session)).toBeNull();
    expect(await failAiSummarySession(pool, { ...session, errorCode: 'late', errorMessage: 'late', rawErrorMessage: null })).toBeNull();
    expect(await upsertTaskRunning(pool, task)).toBe(false);
    expect(await upsertTaskFailed(pool, { ...task, errorCode: 'late', errorMessage: 'late', rawErrorMessage: null })).toBe(false);
    expect((await getAiSummarySessionById(pool, result.sessionId, '1'))?.status).toBe('succeeded');

    // 同一文章开始新的任务后，旧 Worker 既不能抢回任务归属，也不能修改旧会话。
    const newer = await upsertAiSummarySession(pool, { userId: '1', articleId, sourceTextHash: 'new', status: 'queued', draftText: '', jobId: 'new-job' });
    await upsertTaskQueued(pool, { ...task, jobId: 'new-job' });
    await markAiSummarySessionSuperseded(pool, { userId: '1', sessionId: result.sessionId, supersededBySessionId: newer.id });
    expect(await upsertTaskSucceeded(pool, task)).toBe(false);
    expect(await completeAiSummarySession(pool, { ...session, finalText: 'late', model: 'test' })).toBeNull();
    expect(await upsertAiSummarySession(pool, { ...session, userId: '2' })).toBeNull();
    expect((await getArticleTasksByArticleId(pool, articleId, '1'))[0]).toMatchObject({ status: 'queued', jobId: 'new-job' });
  });
});
