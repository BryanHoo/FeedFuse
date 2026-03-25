import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const getFeedRefreshRunByIdMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../server/repositories/feedRefreshRunRepo', () => ({
  getFeedRefreshRunById: (...args: unknown[]) => getFeedRefreshRunByIdMock(...args),
}));

describe('/api/feed-refresh-runs/[runId]', () => {
  beforeEach(() => {
    getFeedRefreshRunByIdMock.mockReset();
  });

  it('GET returns aggregated terminal fields for a failed run', async () => {
    getFeedRefreshRunByIdMock.mockResolvedValue({
      id: '7001',
      scope: 'all',
      status: 'failed',
      feedId: null,
      totalCount: 3,
      succeededCount: 1,
      failedCount: 2,
      errorMessage: '2 个订阅源刷新失败',
      createdAt: '2026-03-25T00:00:00.000Z',
      updatedAt: '2026-03-25T00:01:00.000Z',
      finishedAt: '2026-03-25T00:01:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/feed-refresh-runs/7001'),
      { params: Promise.resolve({ runId: '7001' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: {
        id: '7001',
        scope: 'all',
        status: 'failed',
        totalCount: 3,
        succeededCount: 1,
        failedCount: 2,
        errorMessage: '2 个订阅源刷新失败',
      },
    });
  });
});
