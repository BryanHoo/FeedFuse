import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedsRepo (translation flags)', () => {
  it('listFeeds selects title/body translation flags', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.listFeeds(pool);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_translate_enabled');
    expect(sql).toContain('titleTranslateEnabled');
    expect(sql).toContain('body_translate_enabled');
    expect(sql).toContain('bodyTranslateEnabled');
  });

  it('createFeed inserts and returns title/body translation flags', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.createFeed(pool, { title: 'A', url: 'https://example.com/rss.xml' });
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_translate_enabled');
    expect(sql).toContain('titleTranslateEnabled');
    expect(sql).toContain('body_translate_enabled');
    expect(sql).toContain('bodyTranslateEnabled');
  });

  it('updateFeed supports title/body translation flags and url patch', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./feedsRepo')) as typeof import('./feedsRepo');

    await mod.updateFeed(pool, 'f1', {
      titleTranslateEnabled: true,
      bodyTranslateEnabled: true,
      url: 'https://example.com/rss.xml',
    } as unknown as Parameters<typeof mod.updateFeed>[2]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_translate_enabled');
    expect(sql).toContain('titleTranslateEnabled');
    expect(sql).toContain('body_translate_enabled');
    expect(sql).toContain('bodyTranslateEnabled');
    expect(sql).toContain('url = $');
  });
});
