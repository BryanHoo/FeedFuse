import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedsRepo (kind)', () => {
  it('listFeeds selects kind', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.listFeeds(pool);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('kind');
  });

  it('rss fetch helpers only select rss feeds', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.listEnabledFeedsForFetch(pool);
    const listSql = String(query.mock.calls[0]?.[0] ?? '');
    expect(listSql).toContain("kind = 'rss'");

    query.mockClear();
    await mod.getFeedForFetch(pool, 'feed-1');
    const getSql = String(query.mock.calls[0]?.[0] ?? '');
    expect(getSql).toContain("kind = 'rss'");
  });

  it('updateAllFeedsFetchIntervalMinutes only updates rss feeds', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.updateAllFeedsFetchIntervalMinutes(pool, 30);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("where kind = 'rss'");
  });
});

