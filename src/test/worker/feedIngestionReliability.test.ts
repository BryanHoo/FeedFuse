import { describe, expect, it, vi } from 'vitest';
import { fetchAndIngestFeed } from '@/worker/index';

function setup() {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  const pool = { query: vi.fn(), connect: vi.fn().mockResolvedValue(client) };
  const boss = { send: vi.fn().mockResolvedValue('job-1') };
  const deps = {
    getPool: () => pool,
    getFeedForFetch: vi.fn().mockResolvedValue({
      id: 'feed-1', userId: '2', enabled: true, url: 'https://example.com/rss',
      etag: 'old-etag', lastModified: 'old-modified', lastFetchedAt: null,
      fetchIntervalMinutes: 30, fullTextOnFetchEnabled: false, aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false, titleTranslateEnabled: false,
    }),
    getExternalUrlSafety: vi.fn().mockResolvedValue({ safe: true }),
    getAppSettings: vi.fn().mockResolvedValue({ rssTimeoutMs: 10000, rssUserAgent: 'test' }),
    getUiSettings: vi.fn().mockResolvedValue({}),
    fetchFeedXml: vi.fn().mockResolvedValue({
      status: 200, xml: '<rss />', etag: 'new-etag', lastModified: 'new-modified',
    }),
    parseFeed: vi.fn().mockResolvedValue({
      link: null, language: 'en', items: [{
        guid: 'item-1', link: null, title: 'Article', author: null,
        publishedAt: new Date('2026-01-01'), contentHtml: '<p>Body</p>',
        previewImage: null, summary: null, mediaAttachments: [],
      }],
    }),
    sanitizeContent: vi.fn((html: string) => html),
    insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
    insertArticleMediaAttachments: vi.fn(),
    pruneFeedArticlesToLimit: vi.fn(),
    recordFeedFetchResult: vi.fn(),
    isFeedDue: vi.fn().mockReturnValue(true),
  };
  const run = () => fetchAndIngestFeed(boss as never, 'feed-1', { deps });
  return { client, pool, boss, deps, run };
}

describe('RSS ingestion reliability', () => {
  it.each(['parse', 'insert', 'send', 'prune'])('preserves validators after %s failure', async (stage) => {
    const { deps, boss, pool, run } = setup();
    const failure = new Error(`${stage} failure`);
    if (stage === 'parse') deps.parseFeed.mockRejectedValue(failure);
    if (stage === 'insert') deps.insertArticleIgnoreDuplicate.mockRejectedValue(failure);
    if (stage === 'send') boss.send.mockRejectedValue(failure);
    if (stage === 'prune') deps.pruneFeedArticlesToLimit.mockRejectedValue(failure);

    expect((await run()).errorMessage).toBeTruthy();
    const record = deps.recordFeedFetchResult.mock.calls[0];
    expect(record).toEqual([pool, 'feed-1', expect.objectContaining({
      userId: '2', status: 200, error: expect.any(String),
    })]);
    expect(record[2].etag).toBeUndefined();
    expect(record[2].lastModified).toBeUndefined();
  });

  it.each([200, 304])('advances validators after successful HTTP %s handling', async (status) => {
    const { deps, run } = setup();
    deps.fetchFeedXml.mockResolvedValue({ status, xml: status === 304 ? null : '<rss />', etag: 'new-etag', lastModified: 'new-modified' });
    expect((await run()).errorMessage).toBeNull();
    expect(deps.recordFeedFetchResult).toHaveBeenCalledWith(expect.anything(), 'feed-1', expect.objectContaining({
      etag: 'new-etag', lastModified: 'new-modified', error: null,
    }));
    if (status === 304) expect(deps.parseFeed).not.toHaveBeenCalled();
  });

  it.each([{ status: 500, xml: null }, { status: 200, xml: null }, { status: 200, xml: '' }])(
    'rejects unusable response %j without advancing validators', async ({ status, xml }) => {
      const { deps, run } = setup();
      deps.fetchFeedXml.mockResolvedValue({ status, xml, etag: 'new-etag', lastModified: 'new-modified' });
      expect((await run()).errorMessage).toBeTruthy();
      const record = deps.recordFeedFetchResult.mock.calls[0][2];
      expect(record.etag).toBeUndefined();
      expect(record.lastModified).toBeUndefined();
    },
  );

  it('uses the article transaction connection for queue SQL and commits after send', async () => {
    const { client, deps, boss, run } = setup();
    boss.send.mockImplementation(async (_name, _data, options) => {
      await options.db.executeSql('queue insert', ['article-1']);
      expect(client.query).not.toHaveBeenCalledWith('commit');
      return 'job-1';
    });
    expect(await run()).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleIgnoreDuplicate).toHaveBeenCalledWith(client, expect.any(Object));
    expect(client.query.mock.calls).toEqual([
      ['begin'], ['queue insert', ['article-1']], ['commit'],
    ]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'null'])('rolls back the article when queue send returns %s', async (mode) => {
    const { client, boss, run } = setup();
    if (mode === 'reject') boss.send.mockRejectedValue(new Error('queue unavailable'));
    else boss.send.mockResolvedValue(null);
    expect((await run()).errorMessage).toBeTruthy();
    expect(client.query.mock.calls).toEqual([['begin'], ['rollback']]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('keeps media attachments in the same transaction and rolls back on attachment failure', async () => {
    const { client, deps, boss, run } = setup();
    const parsed = await deps.parseFeed();
    parsed.items[0].mediaAttachments = [{ url: 'https://example.com/a.mp3', mimeType: 'audio/mpeg', sizeBytes: null, durationSeconds: null }];
    deps.insertArticleMediaAttachments.mockRejectedValue(new Error('attachment failure'));
    expect((await run()).errorMessage).toBeTruthy();
    expect(deps.insertArticleMediaAttachments).toHaveBeenCalledWith(client, 'article-1', expect.any(Array), '2');
    expect(client.query.mock.calls).toEqual([['begin'], ['rollback']]);
    expect(boss.send).not.toHaveBeenCalled();
  });
});
