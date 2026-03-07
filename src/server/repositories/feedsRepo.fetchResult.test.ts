import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedsRepo (fetch result fields)', () => {
  it('listFeeds selects last fetch status and error', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.listFeeds(pool);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('last_fetch_status');
    expect(sql).toContain('lastFetchStatus');
    expect(sql).toContain('last_fetch_error');
    expect(sql).toContain('lastFetchError');
  });

  it('recordFeedFetchResult writes null error to clear prior failures', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.recordFeedFetchResult(pool, 'feed-1', { status: 200, error: null });
    expect(query.mock.calls[0]?.[1]).toEqual(['feed-1', null, null, 200, null]);
  });
});
