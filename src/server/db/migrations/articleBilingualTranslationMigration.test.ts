import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds article title translation and bilingual body columns', () => {
    const migrationPath = 'src/server/db/migrations/0011_article_bilingual_translation.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('title_original');
    expect(sql).toContain('title_zh');
    expect(sql).toContain('title_translation_model');
    expect(sql).toContain('title_translation_attempts');
    expect(sql).toContain('title_translation_error');
    expect(sql).toContain('title_translated_at');
    expect(sql).toContain('ai_translation_bilingual_html');
    expect(sql).toContain('ai_translation_segments_json');
  });
});
