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
          title: 'Example',
          url: 'https://example.com/rss.xml',
          siteUrl: null,
          iconUrl: null,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          articleListDisplayMode: 'card',
          categoryId: null,
          fetchIntervalMinutes: 30,
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
    expect(json.data.articles.items).toBeTruthy();
    expect(json.data.articles.items[0].titleZh).toBe('译文标题');
    expect(json.data.articles.nextCursor).toBeNull();
  });
});
