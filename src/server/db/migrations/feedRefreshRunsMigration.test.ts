import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds feed_refresh_runs and feed_refresh_run_items tables', () => {
    const migrationPath = 'src/server/db/migrations/0025_feed_refresh_runs.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists feed_refresh_runs');
    expect(sql).toContain('create table if not exists feed_refresh_run_items');
    expect(sql).toContain("check (scope in ('single', 'all'))");
    expect(sql).toContain("check (status in ('queued', 'running', 'succeeded', 'failed'))");
    expect(sql).toContain('feed_refresh_run_items_run_id_feed_id_key');
  });
});
