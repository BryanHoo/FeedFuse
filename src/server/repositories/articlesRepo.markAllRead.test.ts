import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (markAllRead)', () => {
  it('does not limit omitted feedId updates to rss feeds', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.markAllRead(pool, {});
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).not.toContain("select id from feeds where kind = 'rss'");
  });

  it('does not inject rss-only when feedId is provided', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.markAllRead(pool, { feedId: 'feed-1' });
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).not.toContain("select id from feeds where kind = 'rss'");
  });
});
