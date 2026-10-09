import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { deleteExpiredAiSummaryEvents } from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import { deleteExpiredTranslationEvents } from '@/server/domains/articles/repositories/articleTranslationRepo';

describe.skipIf(!process.env.DATABASE_URL)('stream event retention (PostgreSQL)', () => {
  it.each([
    ['article_ai_summary', deleteExpiredAiSummaryEvents],
    ['article_translation', deleteExpiredTranslationEvents],
  ] as const)('%s preserves active, recent, terminal and other-user events', async (prefix, cleanup) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 });
    const client = await pool.connect();
    try {
      await client.query('begin');
      // 临时表遮蔽同名业务表；测试只操作当前连接的夹具，最后回滚，不修改已有用户数据。
      await client.query(`
        create temporary table ${prefix}_sessions (
          id bigint primary key, user_id bigint, status text, finished_at timestamptz
        ) on commit drop;
        create temporary table ${prefix}_events (
          event_id bigint primary key, user_id bigint, session_id bigint, event_type text
        ) on commit drop;
        insert into ${prefix}_sessions values
          (1, 1, 'failed', now() - interval '8 days'),
          (2, 1, 'running', now() - interval '8 days'),
          (3, 2, 'succeeded', now() - interval '8 days'),
          (4, 1, 'succeeded', now() - interval '1 day'),
          (5, 1, 'succeeded', null);
        insert into ${prefix}_events values
          (101, 1, 1, 'summary.delta'),
          (102, 1, 1, 'summary.snapshot'),
          (103, 1, 1, 'session.completed'),
          (104, 1, 2, 'summary.delta'),
          (105, 2, 3, 'summary.delta'),
          (106, 1, 4, 'summary.delta'),
          (107, 1, 5, 'summary.delta'),
          (108, 1, 3, 'summary.delta'),
          (109, 1, 1, 'session.failed');
      `);
      expect(await cleanup(client, { userId: '1' })).toBe(2);
      const { rows } = await client.query(`select event_id from ${prefix}_events order by event_id`);
      expect(rows.map((row) => row.event_id)).toEqual(['103', '104', '105', '106', '107', '108', '109']);

      // 大量过期数据仍按批次清理，避免一次维护任务产生无界事务。
      await client.query(`
        insert into ${prefix}_events
        select id, 1, 1, 'summary.delta' from generate_series(200, 5200) as id
      `);
      expect(await cleanup(client, { userId: '1' })).toBe(5000);
      const remaining = await client.query(`select event_id from ${prefix}_events where event_id >= 200`);
      expect(remaining.rows).toEqual([{ event_id: '5200' }]);
    } finally {
      await client.query('rollback');
      client.release();
      await pool.end();
    }
  });
});
