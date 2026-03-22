import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds duplicate filtering columns, constraints, and indexes', () => {
    const migrationPath = 'src/server/db/migrations/0024_article_duplicate_filtering.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('normalized_title');
    expect(sql).toContain('normalized_link');
    expect(sql).toContain('content_fingerprint');
    expect(sql).toContain('duplicate_of_article_id');
    expect(sql).toContain('duplicate_reason');
    expect(sql).toContain('duplicate_checked_at');
    expect(sql).toContain('articles_duplicate_reason_check');
    expect(sql).toContain('(published_at desc, id desc)');
    expect(sql).toContain('(normalized_link)');
  });
});
