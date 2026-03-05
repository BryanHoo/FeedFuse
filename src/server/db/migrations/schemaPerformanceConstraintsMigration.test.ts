import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds schema performance indexes and safety constraints', () => {
    const migrationPath = 'src/server/db/migrations/0016_schema_performance_constraints.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create index if not exists articles_sort_published_id_idx');
    expect(sql).toContain('create index if not exists articles_unread_feed_id_idx');
    expect(sql).toContain('drop index if exists article_tasks_article_id_idx');
    expect(sql).toContain('feeds_fetch_interval_minutes_positive');
    expect(sql).toContain('app_settings_rss_timeout_ms_positive');
    expect(sql).toContain('article_tasks_attempts_non_negative');
    expect(sql).toContain('article_tasks_type_check');
  });
});
