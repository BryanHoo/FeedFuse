import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds title/body translation toggles to feeds', () => {
    const migrationPath = 'src/server/db/migrations/0010_feed_translation_toggles.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('alter table feeds');
    expect(sql).toContain('title_translate_enabled');
    expect(sql).toContain('body_translate_enabled');
  });
});
