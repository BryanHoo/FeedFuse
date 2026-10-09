import { describe, expect, it, vi } from 'vitest';

describe('podcast feed ingestion', () => {
  it('stores media attachments and skips article filtering for podcast feeds', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn(), connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }) }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        userId: '1',
        url: 'https://pod.example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getExternalUrlSafety: vi.fn().mockResolvedValue({ safe: true }),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'Podcast',
        link: 'https://pod.example.com',
        language: 'en',
        items: [
          {
            title: 'Episode 1',
            link: 'https://pod.example.com/1',
            guid: 'episode-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Episode</p>',
            previewImage: null,
            summary: 'Episode summary',
            mediaAttachments: [
              {
                url: 'https://pod.example.com/1.mp3',
                mimeType: 'audio/mpeg',
                sizeBytes: 123,
                durationSeconds: 456,
              },
            ],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      [
        {
          url: 'https://pod.example.com/1.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 123,
          durationSeconds: 456,
        },
      ],
      '1',
    );
    expect(boss.send).not.toHaveBeenCalled();
    expect(deps.insertArticleIgnoreDuplicate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: '1',
        filterStatus: 'passed',
        isFiltered: false,
        filteredBy: [],
        filterEvaluatedAt: expect.any(String),
      }),
    );
  });

  it('keeps normal RSS feeds on the article filter queue', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn(), connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }) }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        userId: '1',
        url: 'https://example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getExternalUrlSafety: vi.fn().mockResolvedValue({ safe: true }),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'RSS',
        link: 'https://example.com',
        language: 'en',
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            guid: 'article-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Article</p>',
            previewImage: null,
            summary: 'Article summary',
            mediaAttachments: [],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).not.toHaveBeenCalled();
    expect(boss.send).toHaveBeenCalledWith(
      'article.filter',
      expect.objectContaining({ userId: '1', articleId: 'article-1' }),
      expect.any(Object),
    );
  });

  it('records unsafe URL failures against the feed owner', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn() }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-2',
        userId: '2',
        url: 'http://127.0.0.1/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: false,
        aiSummaryOnFetchEnabled: false,
        bodyTranslateOnFetchEnabled: false,
        titleTranslateEnabled: false,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(false),
      getExternalUrlSafety: vi.fn().mockResolvedValue({
        safe: false,
        reason: 'fake_ip',
        address: '198.18.0.69',
        mode: 'public',
      }),
      getAppSettings: vi.fn(),
      getUiSettings: vi.fn(),
      fetchFeedXml: vi.fn(),
      parseFeed: vi.fn(),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn(),
      insertArticleMediaAttachments: vi.fn(),
      pruneFeedArticlesToLimit: vi.fn(),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-2', { deps });

    expect(result.errorMessage).toBe(
      '更新失败：当前 DNS 将域名解析到 fake-ip 地址 198.18.0.69，但 RSS_NETWORK_MODE 仍是 public。请改为 RSS_NETWORK_MODE=fake-ip 后重试。',
    );
    expect(deps.recordFeedFetchResult).toHaveBeenCalledWith(
      expect.anything(),
      'feed-2',
      expect.objectContaining({
        userId: '2',
        error:
          '更新失败：当前 DNS 将域名解析到 fake-ip 地址 198.18.0.69，但 RSS_NETWORK_MODE 仍是 public。请改为 RSS_NETWORK_MODE=fake-ip 后重试。',
        rawError: 'Unsafe URL',
      }),
    );
  });
});
