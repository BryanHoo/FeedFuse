import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (ai translation)', () => {
  it('getArticleById selects ai translation fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.getArticleById(pool, 'a1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('ai_translation_bilingual_html');
    expect(sql).toContain('ai_translation_zh_html');
    expect(sql).toContain('ai_translation_model');
    expect(sql).toContain('ai_translated_at');
  });

  it('setArticleAiTranslationZh updates ai translation fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const setArticleAiTranslationZh = (
      mod as Partial<{
        setArticleAiTranslationZh: (
          pool: Pool,
          id: string,
          input: { aiTranslationZhHtml: string; aiTranslationModel: string },
        ) => Promise<void>;
      }>
    ).setArticleAiTranslationZh;

    if (typeof setArticleAiTranslationZh !== 'function') {
      expect.fail('setArticleAiTranslationZh is not implemented');
    }

    await setArticleAiTranslationZh(pool, 'a1', {
      aiTranslationZhHtml: '<p>你好</p>',
      aiTranslationModel: 'gpt-4o-mini',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('ai_translation_zh_html');
    expect(sql).toContain('ai_translated_at');
  });

  it('setArticleAiTranslationBilingual updates bilingual ai translation fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const setArticleAiTranslationBilingual = (
      mod as Partial<{
        setArticleAiTranslationBilingual: (
          pool: Pool,
          id: string,
          input: { aiTranslationBilingualHtml: string; aiTranslationModel: string },
        ) => Promise<void>;
      }>
    ).setArticleAiTranslationBilingual;

    if (typeof setArticleAiTranslationBilingual !== 'function') {
      expect.fail('setArticleAiTranslationBilingual is not implemented');
    }

    await setArticleAiTranslationBilingual(pool, 'a1', {
      aiTranslationBilingualHtml: '<div class="ff-bilingual-block"></div>',
      aiTranslationModel: 'gpt-4o-mini',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('ai_translation_bilingual_html');
    expect(sql).toContain('ai_translated_at');
  });
});
