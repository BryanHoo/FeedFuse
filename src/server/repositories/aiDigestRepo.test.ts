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
    expect(sql).toContain('> $');
    expect(sql).toContain('<= $');
  });
});

