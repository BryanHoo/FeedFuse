import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (filtering)', () => {
  it('getArticleById selects filtering fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.getArticleById(pool, 'a1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('filter_status');
    expect(sql).toContain('is_filtered');
    expect(sql).toContain('filtered_by');
    expect(sql).toContain('filter_evaluated_at');
    expect(sql).toContain('filter_error_message');
  });

  it('insertArticleIgnoreDuplicate inserts and returns filtering fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'a1' }] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.insertArticleIgnoreDuplicate(pool, {
      feedId: 'f1',
      dedupeKey: 'k1',
      title: 'Title',
      filterStatus: 'pending',
      isFiltered: false,
      filteredBy: [],
      filterEvaluatedAt: null,
      filterErrorMessage: null,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('filter_status');
    expect(sql).toContain('is_filtered');
    expect(sql).toContain('filtered_by');
    expect(sql).toContain('filter_evaluated_at');
    expect(sql).toContain('filter_error_message');
  });

  it('setArticleFilterResult updates filtering outcome fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.setArticleFilterResult(pool, 'a1', {
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: ['keyword'],
      filterErrorMessage: null,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('filter_status = $2');
    expect(sql).toContain('is_filtered = $3');
    expect(sql).toContain('filtered_by = $4');
    expect(sql).toContain('filter_evaluated_at = now()');
    expect(sql).toContain('filter_error_message = $5');
  });
});
