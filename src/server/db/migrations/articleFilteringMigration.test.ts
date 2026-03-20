import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds article filtering columns, constraints, and indexes', () => {
    const migrationPath = 'src/server/db/migrations/0023_article_filtering.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('filter_status');
    expect(sql).toContain('is_filtered');
    expect(sql).toContain('filtered_by');
    expect(sql).toContain('filter_evaluated_at');
    expect(sql).toContain('filter_error_message');
    expect(sql).toContain('full_text_on_fetch_enabled');
    expect(sql).toContain('articles_filter_status_check');
    expect(sql).toContain('(feed_id, is_filtered, published_at desc, id desc)');
  });
});
