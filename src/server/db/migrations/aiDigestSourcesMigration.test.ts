import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds ai_digest feed kind and digest tables', () => {
    const migrationPath = 'src/server/db/migrations/0019_ai_digest_sources.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists kind');
    expect(sql).toContain("default 'rss'");
    expect(sql).toContain('create table if not exists ai_digest_configs');
    expect(sql).toContain('create table if not exists ai_digest_runs');
    expect(sql).toContain('create index if not exists articles_feed_fetched_id_idx');
  });
});

