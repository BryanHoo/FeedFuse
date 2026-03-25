import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedRefreshRunRepo', () => {
  it('creates refresh runs with returning aggregate fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedRefreshRunRepo')) as typeof import('./feedRefreshRunRepo');

    await mod.createFeedRefreshRun(pool, {
      scope: 'all',
      status: 'queued',
      totalCount: 0,
      feedId: null,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into feed_refresh_runs');
    expect(sql).toContain('returning');
    expect(sql).toContain('total_count as "totalCount"');
  });

  it('upserts refresh run items by run_id and feed_id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedRefreshRunRepo')) as typeof import('./feedRefreshRunRepo');

    await mod.upsertFeedRefreshRunItems(pool, {
      runId: 'run-1',
      items: [
        { feedId: 'feed-1', status: 'queued' },
        { feedId: 'feed-2', status: 'queued' },
      ],
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into feed_refresh_run_items');
    expect(sql).toContain('on conflict (run_id, feed_id)');
    expect(sql).toContain('updated_at = now()');
  });

  it('reads aggregated refresh run state by id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedRefreshRunRepo')) as typeof import('./feedRefreshRunRepo');

    await mod.getFeedRefreshRunById(pool, 'run-1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from feed_refresh_runs');
    expect(sql).toContain('where id = $1');
    expect(sql).toContain('failed_count as "failedCount"');
  });
});
