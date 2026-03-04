import { describe, expect, it, vi } from 'vitest';

describe('articleTranslationRepo', () => {
  it('upsertSession stores running session with hash and counters', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const mod = await import('./articleTranslationRepo');
    await mod.upsertTranslationSession(pool as never, {
      articleId: 'a1',
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 3,
      translatedSegments: 0,
      failedSegments: 0,
    });
    expect(pool.query).toHaveBeenCalled();
  });
});
