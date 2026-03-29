import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds auth columns to app_settings', () => {
    const migrationPath = 'src/server/db/migrations/0026_app_settings_auth.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('auth_password_hash');
    expect(sql).toContain('auth_session_secret');
  });
});
