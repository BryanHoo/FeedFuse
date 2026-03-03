import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (title translation)', () => {
  it('getArticleById selects title translation fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.getArticleById(pool, 'a1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_original');
    expect(sql).toContain('title_zh');
    expect(sql).toContain('title_translation_model');
    expect(sql).toContain('title_translation_attempts');
    expect(sql).toContain('title_translation_error');
    expect(sql).toContain('title_translated_at');
  });

  it('setArticleTitleTranslation updates translated title metadata', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const setArticleTitleTranslation = (
      mod as Partial<{
        setArticleTitleTranslation: (
          pool: Pool,
          id: string,
          input: { titleZh: string; titleTranslationModel: string },
        ) => Promise<void>;
      }>
    ).setArticleTitleTranslation;

    if (typeof setArticleTitleTranslation !== 'function') {
      expect.fail('setArticleTitleTranslation is not implemented');
    }

    await setArticleTitleTranslation(pool, 'a1', {
      titleZh: '你好世界',
      titleTranslationModel: 'gpt-4o-mini',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_zh = $2');
    expect(sql).toContain('title_translation_model = $3');
    expect(sql).toContain('title_translated_at = now()');
  });

  it('recordArticleTitleTranslationFailure increments attempts and stores error', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ titleTranslationAttempts: 2 }],
    });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const recordFailure = (
      mod as Partial<{
        recordArticleTitleTranslationFailure: (
          pool: Pool,
          id: string,
          input: { error: string },
        ) => Promise<number>;
      }>
    ).recordArticleTitleTranslationFailure;

    if (typeof recordFailure !== 'function') {
      expect.fail('recordArticleTitleTranslationFailure is not implemented');
    }

    const attempts = await recordFailure(pool, 'a1', { error: 'rate limited' });
    expect(attempts).toBe(2);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('title_translation_attempts');
    expect(sql).toContain('title_translation_error = $2');
    expect(sql).toContain('returning');
  });
});
