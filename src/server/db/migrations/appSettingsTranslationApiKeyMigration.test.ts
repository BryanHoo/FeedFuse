import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds translation_api_key column to app_settings', () => {
    const migrationPath = 'src/server/db/migrations/0012_app_settings_translation_api_key.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('translation_api_key');
  });
});
