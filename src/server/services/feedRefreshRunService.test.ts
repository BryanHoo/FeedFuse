import { describe, expect, it } from 'vitest';

describe('feedRefreshRunService', () => {
  it('builds aggregate failure summary for refresh all', async () => {
    const mod = await import('./feedRefreshRunService');

    expect(
      mod.buildFeedRefreshRunAggregate({
        scope: 'all',
        items: [
          { feedId: 'feed-1', status: 'succeeded', errorMessage: null },
          { feedId: 'feed-2', status: 'failed', errorMessage: '请求超时' },
          { feedId: 'feed-3', status: 'failed', errorMessage: 'HTTP 500' },
        ],
      }),
    ).toMatchObject({
      status: 'failed',
      totalCount: 3,
      succeededCount: 1,
      failedCount: 2,
      errorMessage: '2 个订阅源刷新失败',
    });
  });

  it('keeps specific short reason for single-feed failure', async () => {
    const mod = await import('./feedRefreshRunService');

    expect(
      mod.buildFeedRefreshRunAggregate({
        scope: 'single',
        items: [{ feedId: 'feed-1', status: 'failed', errorMessage: '请求超时' }],
      }),
    ).toMatchObject({
      status: 'failed',
      totalCount: 1,
      succeededCount: 0,
      failedCount: 1,
      errorMessage: '请求超时',
    });
  });

  it('keeps run in running state while any item is still queued or running', async () => {
    const mod = await import('./feedRefreshRunService');

    expect(
      mod.buildFeedRefreshRunAggregate({
        scope: 'all',
        items: [
          { feedId: 'feed-1', status: 'succeeded', errorMessage: null },
          { feedId: 'feed-2', status: 'running', errorMessage: null },
        ],
      }),
    ).toMatchObject({
      status: 'running',
      totalCount: 2,
      succeededCount: 1,
      failedCount: 0,
      errorMessage: null,
    });
  });
});
