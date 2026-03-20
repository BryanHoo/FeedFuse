import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const getReaderSnapshotMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../server/services/readerSnapshotService', () => ({
  getReaderSnapshot: (...args: unknown[]) => getReaderSnapshotMock(...args),
}));
vi.mock('../../../server/services/readerSnapshotService', () => ({
  getReaderSnapshot: (...args: unknown[]) => getReaderSnapshotMock(...args),
}));

describe('/api/reader/snapshot', () => {
  beforeEach(() => {
    getReaderSnapshotMock.mockReset();
  });

  it('returns snapshot structure', async () => {
    getReaderSnapshotMock.mockResolvedValue({
      categories: [{ id: 'c1', name: 'Tech', position: 0 }],
      feeds: [
        {
          id: 'f1',
          kind: 'rss',
          title: 'Example',
          url: 'https://example.com/rss.xml',
          siteUrl: null,
          iconUrl: null,
          enabled: true,
          fullTextOnOpenEnabled: false,
          fullTextOnFetchEnabled: false,
          aiSummaryOnOpenEnabled: false,
          aiSummaryOnFetchEnabled: false,
          bodyTranslateOnFetchEnabled: false,
          bodyTranslateOnOpenEnabled: false,
          titleTranslateEnabled: false,
          bodyTranslateEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          fetchIntervalMinutes: 30,
          lastFetchStatus: 403,
          lastFetchError: '更新失败：服务器返回 HTTP 403',
          lastFetchRawError: 'HTTP 403 from upstream',
          unreadCount: 0,
        },
      ],
      articles: {
        items: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Original title',
            titleOriginal: 'Original title',
            titleZh: '译文标题',
            summary: 'Summary',
            previewImage: null,
            author: null,
            publishedAt: null,
            link: null,
            filterStatus: 'filtered',
            isFiltered: true,
            filteredBy: ['keyword'],
            isRead: false,
            isStarred: false,
          },
        ],
        nextCursor: null,
      },
    });

    const mod = await import('./route');
    const res = await mod.GET(new Request('http://localhost/api/reader/snapshot'));
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.categories).toBeTruthy();
    expect(json.data.feeds).toBeTruthy();
    expect(json.data.feeds[0].articleListDisplayMode).toBe('card');
    expect(json.data.feeds[0].lastFetchRawError).toBe('HTTP 403 from upstream');
    expect(json.data.articles.items).toBeTruthy();
    expect(json.data.articles.items[0].titleZh).toBe('译文标题');
    expect(json.data.articles.items[0].filterStatus).toBe('filtered');
    expect(json.data.articles.nextCursor).toBeNull();
  });

  it('forwards includeFiltered query param', async () => {
    getReaderSnapshotMock.mockResolvedValue({
      categories: [],
      feeds: [],
      articles: { items: [], nextCursor: null },
    });

    const mod = await import('./route');
    await mod.GET(new Request('http://localhost/api/reader/snapshot?view=1001&includeFiltered=true'));

    expect(getReaderSnapshotMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        view: '1001',
        includeFiltered: true,
      }),
    );
  });
});
