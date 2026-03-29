import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds feed_favicons table and backfills rss icon urls to the internal favicon route', () => {
    const migrationPath = 'src/server/db/migrations/0027_feed_favicons.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists feed_favicons');
    expect(sql).toContain("fetch_status text not null default 'ready'");
    expect(sql).toContain("check (fetch_status in ('ready', 'failed'))");
    expect(sql).toContain('body bytea');
    expect(sql).toContain('next_retry_at timestamptz');
    expect(sql).toContain('references feeds(id) on delete cascade');
    expect(sql).toContain("set icon_url = '/api/feeds/' || id::text || '/favicon'");
    expect(sql).toContain("where kind = 'rss'");
  });
});
