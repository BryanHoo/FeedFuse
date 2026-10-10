import { describe, expect, it, vi } from 'vitest';
import { createFeedFetchHandler, fetchAndIngestFeed } from '@/worker/index';

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
  it.each(['timeout', 'ECONNRESET'])('rejects temporary %s failures without settling feed state', async (message) => {
    const { deps, run } = setup();
    deps.fetchFeedXml.mockRejectedValue(new Error(message));
    await expect(run()).rejects.toThrow(message);
    expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
  });

  it.each([408, 425, 429, 500, 503])('rejects temporary HTTP %s responses for queue retry', async (status) => {
    const { deps, run } = setup();
    deps.fetchFeedXml.mockResolvedValue({ status, xml: null, etag: null, lastModified: null });
    await expect(run()).rejects.toThrow(`HTTP ${status}`);
    expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
  });

  it.each([401, 403, 404, 410])('settles permanent HTTP %s errors immediately', async (status) => {
    const { deps, run } = setup();
    deps.fetchFeedXml.mockResolvedValue({ status, xml: null, etag: null, lastModified: null });
    expect((await run()).errorMessage).toBeTruthy();
    expect(deps.recordFeedFetchResult).toHaveBeenCalledOnce();
  });

  it('retries aborts caused by request timeouts', async () => {
    const { deps, run } = setup();
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    deps.fetchFeedXml.mockRejectedValue(error);
    await expect(run()).rejects.toThrow(error.message);
    expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
  });

  it('retries unresolved DNS without treating it as a permanent safety block', async () => {
    const { deps, run } = setup();
    deps.getExternalUrlSafety.mockResolvedValue({ safe: false, reason: 'unresolved_hostname' } as never);
    await expect(run()).rejects.toThrow('Hostname did not resolve');
    expect(deps.fetchFeedXml).not.toHaveBeenCalled();
    expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
  });

  it.each(['Unsafe URL', 'Response too large', 'Too many redirects'])('settles terminal transport error %s without retry', async (message) => {
    const { deps, run } = setup();
    deps.fetchFeedXml.mockRejectedValue(new Error(message));
    expect((await run()).errorMessage).toBeTruthy();
    expect(deps.recordFeedFetchResult).toHaveBeenCalledOnce();
  });

  it.each(['parse', 'insert', 'send', 'prune'])('preserves validators after %s failure', async (stage) => {
    const { deps, boss, pool, run } = setup();
    const failure = new Error(`${stage} failure`);
    if (stage === 'parse') deps.parseFeed.mockRejectedValue(failure);
    if (stage === 'insert') deps.insertArticleIgnoreDuplicate.mockRejectedValue(failure);
    if (stage === 'send') boss.send.mockRejectedValue(failure);
    if (stage === 'prune') deps.pruneFeedArticlesToLimit.mockRejectedValue(failure);

    if (stage !== 'parse') {
      await expect(run()).rejects.toThrow(failure.message);
      expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
      return;
    }
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
      await expect(run()).rejects.toThrow();
      expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();
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
    await expect(run()).rejects.toThrow();
    expect(client.query.mock.calls).toEqual([['begin'], ['rollback']]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('keeps media attachments in the same transaction and rolls back on attachment failure', async () => {
    const { client, deps, boss, run } = setup();
    const parsed = await deps.parseFeed();
    parsed.items[0].mediaAttachments = [{ url: 'https://example.com/a.mp3', mimeType: 'audio/mpeg', sizeBytes: null, durationSeconds: null }];
    deps.insertArticleMediaAttachments.mockRejectedValue(new Error('attachment failure'));
    await expect(run()).rejects.toThrow('attachment failure');
    expect(deps.insertArticleMediaAttachments).toHaveBeenCalledWith(client, 'article-1', expect.any(Array), '2');
    expect(client.query.mock.calls).toEqual([['begin'], ['rollback']]);
    expect(boss.send).not.toHaveBeenCalled();
  });
});

describe('RSS queue retry lifecycle', () => {
  function workerSetup() {
    const fixture = setup();
    const markRunning = vi.fn();
    const complete = vi.fn();
    const handler = createFeedFetchHandler(fixture.boss as never, { deps: {
      getPool: fixture.deps.getPool as never,
      fetchAndIngestFeed: (boss, feedId, input) => fetchAndIngestFeed(boss, feedId, { ...input, deps: fixture.deps }),
      recordFeedFetchResult: fixture.deps.recordFeedFetchResult,
      markFeedRefreshRunItemRunning: markRunning,
      completeFeedRefreshRunItem: complete,
    } });
    const job = (retryCount: number, retryLimit = 4) => ({
      id: 'job-1', retryCount, retryLimit,
      data: { feedId: 'feed-1', userId: '2', runId: 'run-1', force: false },
    });
    return { ...fixture, handler, markRunning, complete, job };
  }

  it('keeps an intermediate timeout running, then settles success when retry recovers', async () => {
    const { deps, handler, complete, job } = workerSetup();
    deps.fetchFeedXml.mockRejectedValueOnce(new Error('timeout'));
    await expect(handler([job(0)])).rejects.toThrow('timeout');
    expect(complete).not.toHaveBeenCalled();
    expect(deps.recordFeedFetchResult).not.toHaveBeenCalled();

    // 模拟重试前另一轮抓取推进了时间，当前任务仍必须真正执行。
    deps.isFeedDue.mockReturnValue(false);
    await expect(handler([job(1)])).resolves.toBeUndefined();
    expect(deps.fetchFeedXml).toHaveBeenCalledTimes(2);
    expect(complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'succeeded', errorMessage: null }));
  });

  it.each([0, 1, 4])('settles exhausted retry budget %s and still rejects for dead-letter routing', async (retryLimit) => {
    const { deps, handler, complete, job } = workerSetup();
    deps.fetchFeedXml.mockRejectedValue(new Error('timeout'));
    await expect(handler([job(retryLimit, retryLimit)])).rejects.toThrow('timeout');
    expect(deps.recordFeedFetchResult).toHaveBeenCalledWith(expect.anything(), 'feed-1', expect.objectContaining({
      userId: '2', status: null, error: '更新失败：请求超时，请稍后重试', rawError: 'timeout',
    }));
    expect(complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'failed', errorMessage: '更新失败：请求超时，请稍后重试' }));
  });

  it('settles a permanent parse error without consuming queue retries', async () => {
    const { deps, handler, complete, job } = workerSetup();
    deps.parseFeed.mockRejectedValue(new Error('Invalid XML'));
    await expect(handler([job(0)])).resolves.toBeUndefined();
    expect(complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'failed' }));
  });

  it('retains the HTTP failure and feed owner when a scheduled job exhausts retries', async () => {
    const { deps, handler, complete, job } = workerSetup();
    deps.fetchFeedXml.mockResolvedValue({ status: 503, xml: null, etag: 'new-etag', lastModified: 'new-modified' });
    await expect(handler([{ ...job(4), data: { feedId: 'feed-1' } }])).rejects.toThrow('HTTP 503');
    expect(complete).not.toHaveBeenCalled();
    expect(deps.recordFeedFetchResult).toHaveBeenCalledWith(expect.anything(), 'feed-1', {
      userId: '2', status: 503, error: '更新失败：服务器返回 HTTP 503', rawError: 'HTTP 503',
    });
  });

  it('settles infrastructure exceptions before ingestion on the final attempt', async () => {
    const { deps, handler, complete, job } = workerSetup();
    deps.getFeedForFetch.mockRejectedValue(new Error('database unavailable'));
    await expect(handler([job(0)])).rejects.toThrow('database unavailable');
    expect(complete).not.toHaveBeenCalled();
    await expect(handler([job(4)])).rejects.toThrow('database unavailable');
    expect(complete).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'failed' }));
  });
});
