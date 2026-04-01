import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('backfills legacy feed_favicons tables with status columns and nullable failure shape', () => {
    const migrationPath = 'src/server/db/migrations/0028_feed_favicons_legacy_backfill.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('add column if not exists fetch_status text');
    expect(sql).toContain('add column if not exists failure_reason text');
    expect(sql).toContain('add column if not exists next_retry_at timestamptz');
    expect(sql).toContain("set fetch_status = 'ready'");
    expect(sql).toContain('alter column fetch_status set default \'ready\'');
    expect(sql).toContain('alter column fetch_status set not null');
    expect(sql).toContain('alter column source_url drop not null');
    expect(sql).toContain('alter column content_type drop not null');
    expect(sql).toContain('alter column body drop not null');
    expect(sql).toContain('feed_favicons_fetch_status_check');
  });
});
