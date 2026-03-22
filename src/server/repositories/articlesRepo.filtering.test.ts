import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (filtering)', () => {
  it('getArticleById selects filtering and duplicate fields', async () => {
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
    expect(sql).toContain('fetched_at as "fetchedAt"');
    expect(sql).toContain('normalized_title as "normalizedTitle"');
    expect(sql).toContain('normalized_link as "normalizedLink"');
    expect(sql).toContain('content_fingerprint as "contentFingerprint"');
    expect(sql).toContain('duplicate_of_article_id as "duplicateOfArticleId"');
    expect(sql).toContain('duplicate_reason as "duplicateReason"');
    expect(sql).toContain('duplicate_score as "duplicateScore"');
    expect(sql).toContain('duplicate_checked_at as "duplicateCheckedAt"');
  });

  it('insertArticleIgnoreDuplicate inserts and returns filtering and duplicate fields', async () => {
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
    expect(sql).toContain('fetched_at as "fetchedAt"');
    expect(sql).toContain('normalized_title as "normalizedTitle"');
    expect(sql).toContain('normalized_link as "normalizedLink"');
    expect(sql).toContain('content_fingerprint as "contentFingerprint"');
    expect(sql).toContain('duplicate_of_article_id as "duplicateOfArticleId"');
    expect(sql).toContain('duplicate_reason as "duplicateReason"');
    expect(sql).toContain('duplicate_score as "duplicateScore"');
    expect(sql).toContain('duplicate_checked_at as "duplicateCheckedAt"');
  });

  it('setArticleFilterPending clears duplicate filtering metadata fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    await mod.setArticleFilterPending(pool, 'a1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('normalized_title = null');
    expect(sql).toContain('normalized_link = null');
    expect(sql).toContain('content_fingerprint = null');
    expect(sql).toContain('duplicate_of_article_id = null');
    expect(sql).toContain('duplicate_reason = null');
    expect(sql).toContain('duplicate_score = null');
    expect(sql).toContain('duplicate_checked_at = null');
  });

  it('setArticleFilterResult updates filtering outcome and duplicate metadata fields', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const setArticleFilterResult = mod.setArticleFilterResult as (
      pool: Pool,
      id: string,
      input: {
        filterStatus: 'passed' | 'filtered' | 'error';
        isFiltered: boolean;
        filteredBy: string[];
        filterErrorMessage?: string | null;
        normalizedTitle?: string | null;
        normalizedLink?: string | null;
        contentFingerprint?: string | null;
        duplicateOfArticleId?: string | null;
        duplicateReason?: 'same_normalized_url' | 'same_title' | 'similar_content' | null;
        duplicateScore?: number | null;
      },
    ) => Promise<void>;

    await setArticleFilterResult(pool, 'a1', {
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: ['duplicate'],
      filterErrorMessage: null,
      normalizedTitle: 'same title',
      normalizedLink: 'https://example.com/post',
      contentFingerprint: 'abcd1234',
      duplicateOfArticleId: 'a0',
      duplicateReason: 'same_normalized_url',
      duplicateScore: 1,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('filter_status = $2');
    expect(sql).toContain('is_filtered = $3');
    expect(sql).toContain('filtered_by = $4');
    expect(sql).toContain('filter_evaluated_at = now()');
    expect(sql).toContain('filter_error_message = $5');
    expect(sql).toContain('normalized_title = $6');
    expect(sql).toContain('normalized_link = $7');
    expect(sql).toContain('content_fingerprint = $8');
    expect(sql).toContain('duplicate_of_article_id = $9');
    expect(sql).toContain('duplicate_reason = $10');
    expect(sql).toContain('duplicate_score = $11');
    expect(sql).toContain('duplicate_checked_at = now()');
  });
});
