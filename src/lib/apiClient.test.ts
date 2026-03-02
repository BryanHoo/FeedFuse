import { describe, expect, it, vi } from 'vitest';
import type { ReaderSnapshotDto } from './apiClient';
import { mapArticleDto, mapSnapshotArticleItem } from './apiClient';

describe('mapSnapshotArticleItem', () => {
  it('maps preview image from snapshot payload', () => {
    const dto: ReaderSnapshotDto['articles']['items'][number] = {
      id: 'article-1',
      feedId: 'feed-1',
      title: 'Test Article',
      summary: 'Summary',
      author: 'Author',
      publishedAt: '2026-01-01T00:00:00.000Z',
      link: 'https://example.com/article',
      isRead: false,
      isStarred: false,
      previewImage: 'https://example.com/preview.jpg',
    };

    const mapped = mapSnapshotArticleItem(dto);

    expect(mapped.previewImage).toBe('https://example.com/preview.jpg');
    expect(mapped.content).toBe('');
  });
});

it('mapArticleDto prefers contentFullHtml', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    link: 'https://example.com',
    author: null,
    publishedAt: null,
    contentHtml: '<p>rss</p>',
    contentFullHtml: '<p>full</p>',
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
  });
  expect(mapped.content).toContain('full');
});

it('mapArticleDto maps aiTranslationZhHtml', () => {
  const mapped = mapArticleDto({
    id: 'a',
    feedId: 'f',
    dedupeKey: 'k',
    title: 't',
    link: 'https://example.com',
    author: null,
    publishedAt: null,
    contentHtml: '<p>rss</p>',
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationZhHtml: '<p>你好</p>',
    aiTranslationModel: 'gpt-4o-mini',
    aiTranslatedAt: '2026-03-02T00:00:00.000Z',
    summary: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
  });

  expect(mapped.aiTranslationZhHtml).toContain('你好');
});

describe('refreshAllFeeds', () => {
  it('POSTs /api/feeds/refresh', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const mod = (await import('./apiClient')) as Record<string, unknown>;
    const refreshAllFeeds = mod.refreshAllFeeds as undefined | (() => Promise<unknown>);
    expect(refreshAllFeeds).toBeTypeOf('function');

    await refreshAllFeeds?.();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/feeds/refresh'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

it('enqueueArticleAiTranslate POSTs /api/articles/:id/ai-translate', async () => {
  const fetchMock = vi.fn(async () => {
    return new Response(JSON.stringify({ ok: true, data: { enqueued: true, jobId: 'job-1' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  const { enqueueArticleAiTranslate } = await import('./apiClient');
  await enqueueArticleAiTranslate('00000000-0000-0000-0000-000000000000');

  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/api/articles/00000000-0000-0000-0000-000000000000/ai-translate'),
    expect.objectContaining({ method: 'POST' }),
  );
});
