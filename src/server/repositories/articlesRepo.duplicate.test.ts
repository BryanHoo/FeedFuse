import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (duplicate)', () => {
  it('lists duplicate candidates within the 72 hour window', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const listArticleDuplicateCandidates = (
      mod as Partial<{
        listArticleDuplicateCandidates: (
          pool: Pool,
          input: { articleId: string; publishedAt: string | null; fetchedAt: string },
        ) => Promise<unknown[]>;
      }>
    ).listArticleDuplicateCandidates;

    if (typeof listArticleDuplicateCandidates !== 'function') {
      expect.fail('listArticleDuplicateCandidates is not implemented');
    }

    await listArticleDuplicateCandidates(pool, {
      articleId: '42',
      publishedAt: '2026-03-22T10:00:00.000Z',
      fetchedAt: '2026-03-22T10:05:00.000Z',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("coalesce(published_at, fetched_at)");
    expect(sql).toContain("interval '72 hours'");
  });

  it('orders duplicate candidates by earliest fetched article first', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const listArticleDuplicateCandidates = (
      mod as Partial<{
        listArticleDuplicateCandidates: (
          pool: Pool,
          input: { articleId: string; publishedAt: string | null; fetchedAt: string },
        ) => Promise<unknown[]>;
      }>
    ).listArticleDuplicateCandidates;

    if (typeof listArticleDuplicateCandidates !== 'function') {
      expect.fail('listArticleDuplicateCandidates is not implemented');
    }

    await listArticleDuplicateCandidates(pool, {
      articleId: '42',
      publishedAt: null,
      fetchedAt: '2026-03-22T10:05:00.000Z',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('order by fetched_at asc, id asc');
  });

  it('excludes the current article and newer records from duplicate candidates', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = (await import('./articlesRepo')) as typeof import('./articlesRepo');

    const listArticleDuplicateCandidates = (
      mod as Partial<{
        listArticleDuplicateCandidates: (
          pool: Pool,
          input: { articleId: string; publishedAt: string | null; fetchedAt: string },
        ) => Promise<unknown[]>;
      }>
    ).listArticleDuplicateCandidates;

    if (typeof listArticleDuplicateCandidates !== 'function') {
      expect.fail('listArticleDuplicateCandidates is not implemented');
    }

    await listArticleDuplicateCandidates(pool, {
      articleId: '42',
      publishedAt: '2026-03-22T10:00:00.000Z',
      fetchedAt: '2026-03-22T10:05:00.000Z',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('where id <> $1');
    expect(sql).toContain('fetched_at < $3');
  });
});
