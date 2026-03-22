import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (retention)', () => {
  it('pruneFeedArticlesToLimit deletes oldest unstarred rows in a feed', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as Record<string, unknown>;

    if (typeof mod.pruneFeedArticlesToLimit !== 'function') {
      expect.fail('pruneFeedArticlesToLimit is not implemented');
    }

    const result = await (
      mod.pruneFeedArticlesToLimit as (
        db: Pool,
        feedId: string,
        maxStoredArticlesPerFeed: number,
      ) => Promise<{ deletedCount: number }>
    )(pool, 'feed-1', 500);

    expect(result.deletedCount).toBe(2);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('is_starred = false');
    expect(sql).toContain('coalesce(published_at, fetched_at)');
    expect(sql).toContain('feed_id = $1');
    expect(query.mock.calls[0]?.[1]).toEqual(['feed-1', 500]);
  });

  it('pruneAllFeedsArticlesToLimit partitions deletions by feed and preserves starred rows', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 4 });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as Record<string, unknown>;

    if (typeof mod.pruneAllFeedsArticlesToLimit !== 'function') {
      expect.fail('pruneAllFeedsArticlesToLimit is not implemented');
    }

    const result = await (
      mod.pruneAllFeedsArticlesToLimit as (
        db: Pool,
        maxStoredArticlesPerFeed: number,
      ) => Promise<{ deletedCount: number }>
    )(pool, 1000);

    expect(result.deletedCount).toBe(4);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('partition by a.feed_id');
    expect(sql).toContain('delete_rank <= o.overflow_count');
    expect(sql).toContain('is_starred = false');
    expect(query.mock.calls[0]?.[1]).toEqual([1000]);
  });
});
