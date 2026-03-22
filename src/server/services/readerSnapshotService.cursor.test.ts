import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const listCategoriesMock = vi.fn();
const listFeedsMock = vi.fn();

vi.mock('../repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
}));

vi.mock('../repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
}));

describe('readerSnapshotService (cursor)', () => {
  beforeEach(() => {
    listCategoriesMock.mockReset();
    listFeedsMock.mockReset();
  });

  it('qualifies article id in snapshot ordering when joining ai summary sessions', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    const articleQuerySql = query.mock.calls
      .map(([statement]) => String(statement ?? ''))
      .find((statement) => statement.includes('left join lateral'));

    expect(articleQuerySql).toContain('order by "sortPublishedAt" desc, articles.id desc');
  });

  it('qualifies article id in cursor pagination filters for load-more requests', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    await mod.getReaderSnapshot(pool, {
      view: 'all',
      limit: 1,
      cursor: mod.encodeCursor({
        publishedAt: '2026-03-08T00:00:00.000Z',
        id: 'art-1',
      }),
    });

    const articleQuerySql = query.mock.calls
      .map(([statement]) => String(statement ?? ''))
      .find((statement) => statement.includes('left join lateral'));

    expect(articleQuerySql).toContain(
      `(coalesce(published_at, 'epoch'::timestamptz), articles.id) < ($2, $3)`,
    );
  });

  it('emits an ISO cursor when pg returns Date objects for sortPublishedAt', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'art-1',
            feedId: 'feed-1',
            title: 'First',
            titleOriginal: 'First',
            titleZh: null,
            summary: null,
            previewImage: null,
            author: null,
            publishedAt: '2026-03-09T00:00:00.000Z',
            link: 'https://example.com/articles/1',
            filterStatus: 'passed',
            isFiltered: false,
            filteredBy: [],
            sourceLanguage: 'en',
            contentHtml: '<p>First</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: new Date('2026-03-09T00:00:00.000Z'),
          },
          {
            id: 'art-2',
            feedId: 'feed-1',
            title: 'Second',
            titleOriginal: 'Second',
            titleZh: null,
            summary: null,
            previewImage: null,
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/articles/2',
            filterStatus: 'passed',
            isFiltered: false,
            filteredBy: [],
            sourceLanguage: 'en',
            contentHtml: '<p>Second</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: new Date('2026-03-08T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ totalCount: 2 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(mod.decodeCursor(snapshot.articles.nextCursor)).toEqual({
      publishedAt: '2026-03-08T00:00:00.000Z',
      id: 'art-2',
    });
  });
});
