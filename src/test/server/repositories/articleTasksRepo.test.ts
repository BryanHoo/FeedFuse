import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articleTasksRepo', () => {
  it('getArticleTasksByArticleId selects expected columns', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/articles/repositories/articleTasksRepo')) as typeof import('@/server/domains/articles/repositories/articleTasksRepo');

    await mod.getArticleTasksByArticleId(pool, 'a1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from article_tasks');
    expect(sql).toContain('error_code');
    expect(sql).toContain('error_message');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('rawErrorMessage');
    expect(sql).toContain('requested_at');
    expect(sql).toContain('started_at');
    expect(sql).toContain('finished_at');
  });

  it('upsertTaskFailed increments attempts and sets updated_at', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/articles/repositories/articleTasksRepo')) as typeof import('@/server/domains/articles/repositories/articleTasksRepo');

    await mod.upsertTaskFailed(pool, {
      articleId: 'a1',
      type: 'ai_summary',
      jobId: 'job-1',
      errorCode: 'ai_timeout',
      errorMessage: 'timeout',
      rawErrorMessage: '429 rate limit',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into article_tasks');
    expect(sql).toContain('on conflict (user_id, article_id, type) do update');
    expect(sql).not.toContain('user_id = excluded.user_id');
    expect(sql).toContain('attempts');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('updated_at = now()');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '1',
      'a1',
      'ai_summary',
      'failed',
      'job-1',
      'ai_timeout',
      'timeout',
      '429 rate limit',
      ['queued', 'running'],
    ]);
  });
});
