import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const getAiDigestConfigByFeedIdMock = vi.fn();
const updateAiDigestWithCategoryResolutionMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({ getPool: () => pool }));
vi.mock('../../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
}));
vi.mock('../../../../server/services/aiDigestLifecycleService', () => ({
  updateAiDigestWithCategoryResolution: (...args: unknown[]) =>
    updateAiDigestWithCategoryResolutionMock(...args),
}));
vi.mock('../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));

describe('/api/ai-digests/[feedId]', () => {
  beforeEach(() => {
    getAiDigestConfigByFeedIdMock.mockReset();
    updateAiDigestWithCategoryResolutionMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
  });

  it('GET returns digest config for feedId', async () => {
    getAiDigestConfigByFeedIdMock.mockResolvedValue({
      feedId: '1001',
      prompt: '请解读',
      intervalMinutes: 60,
      selectedFeedIds: ['1002'],
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/ai-digests/1001'),
      { params: Promise.resolve({ feedId: '1001' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({
      feedId: '1001',
      prompt: '请解读',
      intervalMinutes: 60,
      selectedFeedIds: ['1002'],
    });
  });

  it('PATCH updates feed and digest config together', async () => {
    updateAiDigestWithCategoryResolutionMock.mockResolvedValue({
      id: '1001',
      kind: 'ai_digest',
      title: '更新后的解读源',
      url: 'http://localhost/__feedfuse_ai_digest__/1001',
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
      categoryId: null,
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
    });

    const mod = await import('./route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/ai-digests/1001', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '更新后的解读源',
          prompt: '更新提示词',
          intervalMinutes: 120,
          selectedFeedIds: ['1002'],
          categoryName: '科技',
        }),
      }),
      { params: Promise.resolve({ feedId: '1001' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.title).toBe('更新后的解读源');
    expect(updateAiDigestWithCategoryResolutionMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        feedId: '1001',
        title: '更新后的解读源',
        prompt: '更新提示词',
        intervalMinutes: 120,
      }),
    );
  });

  it('PATCH rejects selectedCategoryIds payload', async () => {
    const mod = await import('./route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/ai-digests/1001', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'My Digest',
          prompt: '解读',
          intervalMinutes: 60,
          selectedFeedIds: ['1002'],
          selectedCategoryIds: [],
        }),
      }),
      { params: Promise.resolve({ feedId: '1001' }) },
    );

    expect(res.status).toBe(400);
  });
});
