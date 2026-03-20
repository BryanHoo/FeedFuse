import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedsRepo (fullTextOnOpenEnabled)', () => {
  it('listFeeds selects full_text_on_open_enabled and full_text_on_fetch_enabled', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.listFeeds(pool);
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('full_text_on_open_enabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('fullTextOnOpenEnabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('full_text_on_fetch_enabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('fullTextOnFetchEnabled');
  });

  it('createFeed inserts and returns full_text_on_open_enabled and full_text_on_fetch_enabled', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.createFeed(pool, { title: 'A', url: 'https://example.com/rss.xml' });
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('full_text_on_open_enabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('fullTextOnOpenEnabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('full_text_on_fetch_enabled');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('fullTextOnFetchEnabled');
  });

  it('updateFeed supports fullTextOnOpenEnabled/fullTextOnFetchEnabled and url patch and returns them', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.updateFeed(pool, 'f1', {
      fullTextOnOpenEnabled: true,
      fullTextOnFetchEnabled: true,
      url: 'https://example.com/rss.xml',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('full_text_on_open_enabled');
    expect(sql).toContain('fullTextOnOpenEnabled');
    expect(sql).toContain('full_text_on_fetch_enabled');
    expect(sql).toContain('fullTextOnFetchEnabled');
    expect(sql).toContain('url = $');
  });
});
