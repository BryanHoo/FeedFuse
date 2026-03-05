import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('feed ai trigger flags migration', () => {
  it('adds summary/translate on-fetch and translate on-open columns', () => {
    const sql = readFileSync(
      resolve(process.cwd(), 'src/server/db/migrations/0015_feed_ai_trigger_flags.sql'),
      'utf8',
    );

    expect(sql).toContain('ai_summary_on_fetch_enabled');
    expect(sql).toContain('body_translate_on_fetch_enabled');
    expect(sql).toContain('body_translate_on_open_enabled');
  });
});
