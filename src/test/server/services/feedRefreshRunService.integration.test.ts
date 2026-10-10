import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as repo from '@/server/domains/feeds/repositories/feedRefreshRunRepo';
import {
  completeFeedRefreshRunItem,
  initializeFeedRefreshRun,
} from '@/server/domains/feeds/services/feedRefreshRunService';

// 使用真实 PostgreSQL 与随机 schema；查询屏障只控制执行顺序，不模拟数据库结果或行锁。
describe.skipIf(!process.env.DATABASE_URL)('刷新汇总并发（隔离 PostgreSQL）', () => {
  const schema = `refresh_run_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
  const options = {
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  };
  const slow = new Pool({ ...options, application_name: `${schema}_slow` });
  const fast = new Pool({ ...options, application_name: `${schema}_fast` });
  // 观察连接独立于暂停/排队的事务，直接读取同一隔离 schema。
  const observer = new Pool(options);

  beforeAll(async () => {
    await admin.query(`create schema ${schema}`);
    await slow.query('create table feeds(id bigint primary key)');
    await slow.query(readFileSync('src/server/infra/db/migrations/0025_feed_refresh_runs.sql', 'utf8'));
    // 补齐后续多用户迁移提供的列、冲突键与同用户父子关系约束。
    await slow.query(`
      alter table feed_refresh_runs add column user_id bigint not null;
      alter table feed_refresh_runs add unique(user_id, id);
      alter table feed_refresh_run_items add column user_id bigint not null;
      alter table feed_refresh_run_items drop constraint feed_refresh_run_items_run_id_feed_id_key;
      alter table feed_refresh_run_items add unique(user_id, run_id, feed_id);
      alter table feed_refresh_run_items add foreign key(user_id, run_id)
        references feed_refresh_runs(user_id, id);
      insert into feeds values(11), (12);
    `);
  });

  beforeEach(async () => {
    await slow.query('truncate feed_refresh_runs, feed_refresh_run_items restart identity');
  });

  afterAll(async () => {
    await Promise.all([slow.end(), fast.end(), observer.end()]);
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  });

  it.each(['succeeded', 'failed'] as const)(
    '旧汇总暂停期间另一订阅完成为 %s，最终状态和计数不得倒退',
    async (terminalStatus) => {
      const run = await initializeFeedRefreshRun(slow, {
        scope: 'all', targetFeedIds: ['11', '12'], userId: '2',
      });
      const originalList = repo.listFeedRefreshRunItemsByRunId;
      let notifyRead!: () => void;
      let resumeSlow!: () => void;
      const read = new Promise<void>((resolve) => { notifyRead = resolve; });
      const resume = new Promise<void>((resolve) => { resumeSlow = resolve; });
      let firstRead = true;
      vi.spyOn(repo, 'listFeedRefreshRunItemsByRunId').mockImplementation(async (...args) => {
        const items = await originalList(...args);
        if (firstRead) {
          firstRead = false;
          // 固定旧快照：第一个源成功、第二个源仍排队，此时旧汇总只能得到 running。
          notifyRead();
          await resume;
        }
        return items;
      });

      const older = completeFeedRefreshRunItem(slow, {
        runId: run.id, feedId: '11', status: 'succeeded', userId: '2',
      });
      let newer: ReturnType<typeof completeFeedRefreshRunItem> | undefined;
      try {
        await read;
        newer = completeFeedRefreshRunItem(fast, {
          runId: run.id, feedId: '12', status: terminalStatus,
          errorMessage: terminalStatus === 'failed' ? '请求超时' : null, userId: '2',
        });
        // 不用固定睡眠猜测时序：旧代码会先提交终态，修复后则必须在读取 run 时等待真实行锁。
        await vi.waitFor(async () => {
          const state = await repo.getFeedRefreshRunById(observer, run.id, '2');
          const { rows } = await admin.query<{ blocked: boolean }>(`
            select exists(
              select 1 from pg_stat_activity
              where application_name = $1 and wait_event_type = 'Lock'
                and query ilike '%select%from feed_refresh_runs%'
                and cardinality(pg_blocking_pids(pid)) > 0
            ) as blocked
          `, [`${schema}_fast`]);
          expect(state?.status === terminalStatus || rows[0].blocked).toBe(true);
        }, { timeout: 3000, interval: 10 });
      } finally {
        // 即使断言失败也释放屏障并等事务结束，避免清理 schema 时等待尚未释放的行锁。
        resumeSlow();
        await Promise.allSettled([older, ...(newer ? [newer] : [])]);
      }

      // 清理时等待所有事务；断言时仍传播执行错误，不能把数据库异常当作并发测试通过。
      await expect(older).resolves.toMatchObject({ status: 'running', finishedAt: null });
      await expect(newer).resolves.toMatchObject({ status: terminalStatus });
      expect(await repo.getFeedRefreshRunById(slow, run.id, '2')).toMatchObject({
        status: terminalStatus,
        totalCount: 2,
        succeededCount: terminalStatus === 'succeeded' ? 2 : 1,
        failedCount: terminalStatus === 'failed' ? 1 : 0,
        errorMessage: terminalStatus === 'failed' ? '1 个订阅源刷新失败' : null,
        finishedAt: expect.any(Date),
      });
      expect(await repo.getFeedRefreshRunById(slow, run.id, '3')).toBeNull();
    },
  );

  it('汇总写入异常会回滚并释放行锁，后续汇总能够正常完成', async () => {
    const run = await initializeFeedRefreshRun(slow, {
      scope: 'single', targetFeedIds: ['11'], userId: '2',
    });
    vi.spyOn(repo, 'updateFeedRefreshRun').mockRejectedValueOnce(new Error('汇总写入故障'));
    const input = { runId: run.id, feedId: '11', status: 'succeeded' as const, userId: '2' };
    await expect(completeFeedRefreshRunItem(slow, input)).rejects.toThrow('汇总写入故障');
    expect(await repo.getFeedRefreshRunById(fast, run.id, '2')).toMatchObject({
      status: 'queued', succeededCount: 0, finishedAt: null,
    });
    await expect(completeFeedRefreshRunItem(fast, input)).resolves.toMatchObject({
      status: 'succeeded', succeededCount: 1, finishedAt: expect.any(Date),
    });
  });
});
