import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('aiDigestRepo', () => {
  it('lists due configs only for enabled ai_digest feeds', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./aiDigestRepo')) as typeof import('./aiDigestRepo');

    await mod.listDueAiDigestConfigFeedIds(pool, { now: new Date('2026-03-14T00:00:00.000Z') });
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from ai_digest_configs');
    expect(sql).toContain('join feeds');
    expect(sql).toContain("feeds.kind = 'ai_digest'");
    expect(sql).toContain('feeds.enabled = true');
  });

  it('queries candidate articles by fetched_at window', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./aiDigestRepo')) as typeof import('./aiDigestRepo');

    await mod.listAiDigestCandidateArticles(pool, {
      targetFeedIds: ['00000000-0000-0000-0000-000000000000'],
      windowStartAt: '2026-03-14T00:00:00.000Z',
      windowEndAt: '2026-03-14T01:00:00.000Z',
      limit: 500,
    });
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from articles');
    expect(sql).toContain('fetched_at');
    expect(sql).toContain('any($1::bigint[])');
    expect(sql).toContain('> $');
    expect(sql).toContain('<= $');
    expect(sql).toContain("filter_status = any('{passed,error}'::text[])");
  });

  it('replaces run sources by run id and preserves position order', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./aiDigestRepo')) as typeof import('./aiDigestRepo');

    await mod.replaceAiDigestRunSources(pool, {
      runId: 'run-1',
      sources: [
        { sourceArticleId: 'a-1', position: 0 },
        { sourceArticleId: 'a-2', position: 1 },
      ],
    });

    const joinedSql = query.mock.calls.map((call) => String(call[0])).join('\n');
    expect(joinedSql).toContain('delete from ai_digest_run_sources');
    expect(joinedSql).toContain('insert into ai_digest_run_sources');
    expect(joinedSql).toContain('::bigint');
  });

  it('creates digest run with returning id payload', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./aiDigestRepo')) as typeof import('./aiDigestRepo');

    await mod.createAiDigestRun(pool, {
      feedId: '1001',
      windowStartAt: '2026-03-14T00:00:00.000Z',
      windowEndAt: '2026-03-14T01:00:00.000Z',
      status: 'queued',
    });

    const createRunSql = String(query.mock.calls[0]?.[0] ?? '');
    expect(createRunSql).toContain('returning');
    expect(createRunSql).toContain('id');
  });

  it('lists run sources by digest article id ordered by position', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./aiDigestRepo')) as typeof import('./aiDigestRepo');

    await mod.listAiDigestRunSourcesByArticleId(pool, 'article-1');
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from ai_digest_runs r');
    expect(sql).toContain('join ai_digest_run_sources s');
    expect(sql).toContain('order by s.position asc');
  });
});
