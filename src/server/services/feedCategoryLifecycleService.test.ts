import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  createFeedWithCategoryResolution,
  deleteFeedAndCleanupCategory,
  updateFeedWithCategoryResolution,
} from './feedCategoryLifecycleService';

function createMockPool() {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  } as unknown as PoolClient & {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool & {
    connect: ReturnType<typeof vi.fn>;
  };

  return { pool, client };
}

describe('feedCategoryLifecycleService', () => {
  it('creates a new category at the end and binds it when categoryName does not exist', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ nextPosition: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'cat-tech', name: 'Tech', position: 3 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            title: 'Example',
            url: 'https://example.com/feed.xml',
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: 'cat-tech',
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce(undefined);

    await createFeedWithCategoryResolution(pool, {
      title: 'Example',
      url: 'https://example.com/feed.xml',
      siteUrl: null,
      categoryName: 'Tech',
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into categories'),
      ['Tech', 3],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into feeds'),
      expect.arrayContaining(['cat-tech']),
    );
  });

  it('reuses an existing category when categoryName only differs by case or spaces', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'cat-tech', name: 'Tech', position: 0 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            title: 'Example',
            url: 'https://example.com/feed.xml',
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: 'cat-tech',
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce(undefined);

    await createFeedWithCategoryResolution(pool, {
      title: 'Example',
      url: 'https://example.com/feed.xml',
      siteUrl: null,
      categoryName: '  tech  ',
    });

    expect(client.query).not.toHaveBeenCalledWith(
      expect.stringContaining('insert into categories'),
      expect.anything(),
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('insert into feeds'),
      expect.arrayContaining(['cat-tech']),
    );
  });

  it('removes the previous category when an update leaves it empty', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            categoryId: 'cat-old',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'cat-new', name: 'New', position: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            title: 'Updated',
            url: 'https://example.com/feed.xml',
            siteUrl: null,
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: 'cat-new',
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    await updateFeedWithCategoryResolution(pool, 'feed-1', {
      categoryName: 'New',
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from categories'),
      ['cat-old'],
    );
  });

  it('deletes the category when deleting the last feed in it', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            categoryId: 'cat-tech',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    const deleted = await deleteFeedAndCleanupCategory(pool, 'feed-1');

    expect(deleted).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from categories'),
      ['cat-tech'],
    );
  });

  it('sets the persisted icon url to the internal favicon route when creating an rss feed with siteUrl', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            kind: 'rss',
            title: 'Example',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://example.com',
            iconUrl: null,
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: null,
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            kind: 'rss',
            title: 'Example',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://example.com',
            iconUrl: '/api/feeds/feed-1/favicon',
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: null,
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce(undefined);

    const created = await createFeedWithCategoryResolution(pool, {
      title: 'Example',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('update feeds'),
      ['/api/feeds/feed-1/favicon', 'feed-1'],
    );
    expect(created.iconUrl).toBe('/api/feeds/feed-1/favicon');
  });

  it('clears cached favicon data when siteUrl changes', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            categoryId: null,
            siteUrl: 'https://old.example.com',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'feed-1',
            kind: 'rss',
            title: 'Updated',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://new.example.com',
            iconUrl: '/api/feeds/feed-1/favicon',
            enabled: true,
            fullTextOnOpenEnabled: false,
            aiSummaryOnOpenEnabled: false,
            aiSummaryOnFetchEnabled: false,
            bodyTranslateOnFetchEnabled: false,
            bodyTranslateOnOpenEnabled: false,
            titleTranslateEnabled: false,
            bodyTranslateEnabled: false,
            articleListDisplayMode: 'card',
            categoryId: null,
            fetchIntervalMinutes: 30,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    await updateFeedWithCategoryResolution(pool, 'feed-1', {
      siteUrl: 'https://new.example.com',
    });

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from feed_favicons'),
      ['feed-1'],
    );
  });
});
