import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startFeverBatchRead, retryFeverBatchRead } from '@/server/domains/fever/services/feverBatchReadService';
import { runFeverBatchReadWorker } from '@/worker/feverBatchRead';
import { claimBatchReadItem, finishBatchReadItem, listBatchReadTasks } from '@/server/domains/fever/repositories/feverBatchReadRepo';
import { JOB_FEVER_BATCH_READ_ITEM } from '@/server/infra/queue/jobs';

const mocks = vi.hoisted(() => ({ startBoss: vi.fn(), markItem: vi.fn() }));
vi.mock('@/server/infra/queue/boss', () => ({ startBoss: mocks.startBoss }));
vi.mock('@/server/domains/fever/services/feverWritebackService', () => ({ createClientForAccount: async () => ({ markItem: mocks.markItem }) }));

// 真正执行新迁移、Repository SQL 和 pg-boss 双写；全部数据位于随机 schema，结束后删除。
describe.skipIf(!process.env.DATABASE_URL)('Fever 批量已读（隔离 PostgreSQL 和 pg-boss）', () => {
  const schema = `fever_batch_${randomBytes(6).toString('hex')}`;
  const jobsSchema = `${schema}_jobs`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: jobsSchema, supervise: false, schedule: false });
  beforeAll(async () => {
    await admin.query(`create schema ${schema}`);
    await pool.query(`
      create table users(id bigint primary key);
      create table articles(id bigint primary key, user_id bigint not null, feed_id bigint not null, title text not null, is_read boolean default false, read_at timestamptz);
      create table fever_accounts(id bigint primary key, user_id bigint not null, enabled boolean default true);
      create table fever_feed_mappings(user_id bigint, fever_account_id bigint, fever_feed_id text, is_active boolean default true);
      create table fever_item_mappings(user_id bigint, fever_account_id bigint, fever_item_id text, fever_feed_id text,
        local_article_id bigint, local_feed_id bigint, is_active boolean default true,
        remote_is_read boolean default false, remote_is_saved boolean default false);
    `);
    await pool.query(readFileSync('src/server/infra/db/migrations/0039_fever_batch_read.sql', 'utf8'));
    await boss.start();
    mocks.startBoss.mockResolvedValue(boss);
  }, 20000);
  beforeEach(async () => {
    await boss.deleteAllJobs(JOB_FEVER_BATCH_READ_ITEM).catch(() => {});
    await pool.query(`truncate fever_batch_read_items, fever_batch_read_runs, fever_item_mappings, fever_feed_mappings, fever_accounts, articles, users restart identity cascade;
      insert into users values (2), (3);
      insert into articles(id, user_id, feed_id, title) values (11, 2, 5, '第一篇'), (12, 2, 5, '第二篇'), (13, 2, 5, '第三篇'), (14, 2, 6, '本地文章'), (15, 2, 7, '停用文章'), (16, 3, 8, '他人文章');
      insert into fever_accounts(id, user_id) values (3, 2);
      insert into fever_feed_mappings(user_id, fever_account_id, fever_feed_id) values (2, 3, 'feed');
      insert into fever_item_mappings(user_id, fever_account_id, fever_item_id, fever_feed_id, local_article_id, local_feed_id, is_active)
        values (2, 3, 'a', 'feed', 11, 5, true), (2, 3, 'b', 'feed', 12, 5, true), (2, 3, 'c', 'feed', 13, 5, true), (2, 3, 'd', 'feed', 15, 7, false);`);
    mocks.markItem.mockReset().mockImplementation(async ({ itemId }) => { if (itemId === 'b') throw new Error('Fever 请求超时，请重试'); });
  });
  afterAll(async () => {
    await boss.stop({ graceful: true, timeout: 5000 });
    await pool.end();
    await admin.query(`drop schema if exists ${jobsSchema} cascade`);
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });

  async function readFlags() {
    return (await pool.query('select id::text, is_read from articles order by id')).rows;
  }
  async function consumeJobs() {
    const jobs = await boss.fetch(JOB_FEVER_BATCH_READ_ITEM, { batchSize: 20, includeMetadata: true });
    for (const job of jobs) {
      await runFeverBatchReadWorker(pool, job);
      await boss.complete(JOB_FEVER_BATCH_READ_ITEM, job.id);
    }
    return jobs;
  }

  it('请求不写远端，逐项成功即时落本地，中途失败不阻断后续，重试只重放失败项', async () => {
    const result = await startFeverBatchRead(pool, { userId: '2' });
    expect(result.updatedCount).toBe(1);
    expect(result.task).toMatchObject({ status: 'queued', totalCount: 3, succeededCount: 0, failedCount: 0 });
    expect(mocks.markItem).not.toHaveBeenCalled();
    const jobs = await boss.fetch(JOB_FEVER_BATCH_READ_ITEM, { batchSize: 20, includeMetadata: true });
    const first = jobs.find(job => (job.data as { feverItemId: string }).feverItemId === 'a')!;
    await runFeverBatchReadWorker(pool, first);
    expect((await readFlags()).find(row => row.id === '11').is_read).toBe(true);
    for (const job of jobs) {
      if (job.id !== first.id) await runFeverBatchReadWorker(pool, job);
      await boss.complete(JOB_FEVER_BATCH_READ_ITEM, job.id);
    }
    const [task] = await listBatchReadTasks(pool, '2');
    expect(task).toMatchObject({ status: 'failed', succeededCount: 2, failedCount: 1, localUpdatedCount: 1 });
    expect(task.failures).toEqual([{ articleId: '12', title: '第二篇', errorMessage: 'Fever 请求超时，请重试' }]);
    expect(await readFlags()).toEqual([
      { id: '11', is_read: true }, { id: '12', is_read: false }, { id: '13', is_read: true },
      { id: '14', is_read: true }, { id: '15', is_read: false }, { id: '16', is_read: false },
    ]);
    mocks.markItem.mockResolvedValue(undefined);
    await Promise.all([retryFeverBatchRead(pool, { runId: task.id, userId: '2' }), retryFeverBatchRead(pool, { runId: task.id, userId: '2' })]);
    const retried = await consumeJobs();
    expect(retried).toHaveLength(1);
    expect(retried[0].data).toMatchObject({ articleId: '12', attempt: 2 });
    expect(mocks.markItem).toHaveBeenCalledTimes(4);
    expect((await listBatchReadTasks(pool, '2'))[0]).toMatchObject({ status: 'succeeded', succeededCount: 3, failedCount: 0 });
    // 成功任务及旧版本消息不能再获得执行权。
    expect(await claimBatchReadItem(pool, first.data as never)).toBeNull();
    expect(await finishBatchReadItem(pool, jobs.find(job => (job.data as { feverItemId: string }).feverItemId === 'b')!.data as never, 'failed', 'stale')).toBe(false);
  }, 30_000);

  it('业务与真实队列双写整体回滚，失败重试也不会遗留新版本或任务', async () => {
    const original = boss.insert.bind(boss);
    const spy = vi.spyOn(boss, 'insert').mockImplementation(async (...args) => { await original(...args); throw new Error('入队后故障'); });
    await expect(startFeverBatchRead(pool, { userId: '2' })).rejects.toThrow('入队后故障');
    expect(await listBatchReadTasks(pool, '2')).toEqual([]);
    expect(await boss.findJobs(JOB_FEVER_BATCH_READ_ITEM)).toHaveLength(0);
    expect((await readFlags()).find(row => row.id === '14').is_read).toBe(false);
    spy.mockRestore();
    const { task } = await startFeverBatchRead(pool, { userId: '2' });
    await consumeJobs();
    vi.spyOn(boss, 'insert').mockRejectedValue(new Error('queue down'));
    await expect(retryFeverBatchRead(pool, { runId: task!.id, userId: '2' })).rejects.toThrow('queue down');
    expect((await listBatchReadTasks(pool, '2'))[0]).toMatchObject({ status: 'failed', failedCount: 1 });
    expect((await pool.query("select attempt from fever_batch_read_items where article_id = 12")).rows[0].attempt).toBe(1);
  }, 30_000);

  it('限制当前用户的查询、重试和任务执行，数据库拒绝跨用户批次条目', async () => {
    const { task } = await startFeverBatchRead(pool, { userId: '2', feedId: '5' });
    expect(await listBatchReadTasks(pool, '3')).toEqual([]);
    await expect(retryFeverBatchRead(pool, { runId: task!.id, userId: '3' })).rejects.toMatchObject({ status: 404 });
    expect(await claimBatchReadItem(pool, { runId: task!.id, userId: '3', articleId: '11', feverAccountId: '3', feverItemId: 'a', attempt: 1 })).toBeNull();
    await expect(pool.query(`insert into fever_batch_read_items(user_id, run_id, article_id, article_title, fever_account_id, fever_item_id) values (3, $1, 16, '跨用户', 3, 'x')`, [task!.id])).rejects.toMatchObject({ code: '23503' });
  }, 30_000);
});
