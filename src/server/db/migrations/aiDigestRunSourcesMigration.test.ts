import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds ai_digest_run_sources mapping table and indexes', () => {
    const migrationPath = 'src/server/db/migrations/0020_ai_digest_run_sources.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists ai_digest_run_sources');
    expect(sql).toContain('run_id uuid not null');
    expect(sql).toContain('source_article_id uuid not null');
    expect(sql).toContain('position int not null');
    expect(sql).toContain('primary key (run_id, source_article_id)');
    expect(sql).toContain('unique (run_id, position)');
  });
});
