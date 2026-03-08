import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const listCategoriesMock = vi.fn();
const listFeedsMock = vi.fn();
const getUiSettingsMock = vi.fn();

vi.mock('../repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
}));

vi.mock('../repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
}));

vi.mock('../repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
}));

describe('readerSnapshotService (preview image)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    listCategoriesMock.mockReset();
    listFeedsMock.mockReset();
    getUiSettingsMock.mockReset();
  });

  it('selects preview_image_url as previewImage', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    const sql = query.mock.calls
      .map(([statement]) => String(statement ?? ''))
      .find((statement) => statement.includes('preview_image_url'));

    expect(sql).toContain('preview_image_url');
  });

  it('keeps previewImage unchanged when IMAGE_PROXY_SECRET is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            summary: 'Summary',
            previewImage: 'https://img.example.com/card.jpg',
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/article',
            sourceLanguage: 'en',
            contentHtml: '<p>Hello</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: '2026-03-08T00:00:00.000Z',
          },
        ],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(snapshot.articles.items[0].previewImage).toBe('https://img.example.com/card.jpg');
  });

  it('decodes html entities in previewImage when IMAGE_PROXY_SECRET is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            summary: 'Summary',
            previewImage: 'https://img.example.com/card.jpg?foo=1&amp;bar=2',
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/article',
            sourceLanguage: 'en',
            contentHtml: '<p>Hello</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: '2026-03-08T00:00:00.000Z',
          },
        ],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(snapshot.articles.items[0].previewImage).toBe('https://img.example.com/card.jpg?foo=1&bar=2');
  });

  it('rewrites previewImage to a signed proxy url', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            summary: 'Summary',
            previewImage: 'https://img.example.com/card.jpg',
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/article',
            sourceLanguage: 'en',
            contentHtml: '<p>Hello</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: '2026-03-08T00:00:00.000Z',
          },
        ],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(snapshot.articles.items[0].previewImage).toContain('/api/media/image?');
    expect(snapshot.articles.items[0].previewImage).toContain(
      'url=https%3A%2F%2Fimg.example.com%2Fcard.jpg',
    );
    expect(snapshot.articles.items[0].previewImage).toContain('w=192');
    expect(snapshot.articles.items[0].previewImage).toContain('h=208');
    expect(snapshot.articles.items[0].previewImage).toContain('q=55');
  });

  it('rewrites html-encoded previewImage to a signed proxy url', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            summary: 'Summary',
            previewImage: 'https://img.example.com/card.jpg?foo=1&amp;bar=2',
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/article',
            sourceLanguage: 'en',
            contentHtml: '<p>Hello</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: '2026-03-08T00:00:00.000Z',
          },
        ],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(snapshot.articles.items[0].previewImage).toContain('/api/media/image?');
    expect(snapshot.articles.items[0].previewImage).toContain(
      'url=https%3A%2F%2Fimg.example.com%2Fcard.jpg%3Ffoo%3D1%26bar%3D2',
    );
    expect(snapshot.articles.items[0].previewImage).not.toContain('amp%3Bbar');
  });

  it('drops expired signed previewImage urls', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'a1',
            feedId: 'f1',
            title: 'Hello',
            titleOriginal: 'Hello',
            titleZh: null,
            summary: 'Summary',
            previewImage: 'https://img.example.com/card.jpg?x-expires=1&x-signature=expired',
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/article',
            sourceLanguage: 'en',
            contentHtml: '<p>Hello</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: '2026-03-08T00:00:00.000Z',
          },
        ],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('./readerSnapshotService')) as typeof import('./readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(snapshot.articles.items[0].previewImage).toBeNull();
  });
});
