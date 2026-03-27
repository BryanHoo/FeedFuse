import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn() };
const searchArticlesMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../server/repositories/articlesRepo', () => ({
  searchArticles: (...args: unknown[]) => searchArticlesMock(...args),
}));

describe('/api/articles/search', () => {
  beforeEach(() => {
    searchArticlesMock.mockReset();
  });

  it('returns matched articles for a valid keyword query', async () => {
    searchArticlesMock.mockResolvedValue([
      {
        id: 'article-1',
        feedId: 'feed-1',
        feedTitle: 'Feed 1',
        title: 'FeedFuse 搜索',
        titleOriginal: 'FeedFuse Search',
        titleZh: 'FeedFuse 搜索',
        summary: 'summary',
        excerpt: 'excerpt',
        publishedAt: '2026-03-26T09:00:00.000Z',
      },
    ]);

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/articles/search?keyword=FeedFuse&limit=12'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.data.items).toHaveLength(1);
    expect(searchArticlesMock).toHaveBeenCalledWith(pool, {
      keyword: 'FeedFuse',
      limit: 12,
    });
  });

  it('rejects an empty keyword query', async () => {
    const mod = await import('./route');
    const res = await mod.GET(new Request('http://localhost/api/articles/search?keyword='));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.fields.keyword).toBeTruthy();
    expect(searchArticlesMock).not.toHaveBeenCalled();
  });

  it('rejects unsupported query params', async () => {
    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/articles/search?keyword=FeedFuse&page=2'),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.fields.page).toBe('不支持的查询参数');
    expect(searchArticlesMock).not.toHaveBeenCalled();
  });
});
