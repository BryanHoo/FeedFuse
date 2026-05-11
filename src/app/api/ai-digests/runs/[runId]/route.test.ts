import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const getAiDigestRunByIdMock = vi.fn();
const getPrivateFmEpisodeByRunIdMock = vi.fn();

vi.mock('../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestRunById: (...args: unknown[]) => getAiDigestRunByIdMock(...args),
}));

vi.mock('../../../../../server/repositories/privateFmRepo', () => ({
  getPrivateFmEpisodeByRunId: (...args: unknown[]) =>
    getPrivateFmEpisodeByRunIdMock(...args),
}));

describe('/api/ai-digests/runs/[runId]', () => {
  beforeEach(() => {
    getAiDigestRunByIdMock.mockReset();
    getPrivateFmEpisodeByRunIdMock.mockReset();
    getPrivateFmEpisodeByRunIdMock.mockResolvedValue(null);
  });

  it('GET returns stable terminal fields for a failed run', async () => {
    getAiDigestRunByIdMock.mockResolvedValue({
      id: '5001',
        status: 'failed',
        candidateTotal: 3,
        selectedCount: 0,
        articleId: null,
        privateFmEnabled: false,
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
        updatedAt: '2026-03-25T00:00:00.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/ai-digests/runs/5001'),
      { params: Promise.resolve({ runId: '5001' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: {
        id: '5001',
        status: 'failed',
        candidateTotal: 3,
        selectedCount: 0,
        articleId: null,
        privateFmEnabled: false,
        privateFmEpisode: null,
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
      },
    });
  });

  it('GET returns private FM episode status when attached to the run', async () => {
    getAiDigestRunByIdMock.mockResolvedValue({
      id: '5002',
      status: 'succeeded',
      candidateTotal: 12,
      selectedCount: 5,
      articleId: '9001',
      privateFmEnabled: true,
      errorCode: null,
      errorMessage: null,
      updatedAt: '2026-03-25T00:00:00.000Z',
    });
    getPrivateFmEpisodeByRunIdMock.mockResolvedValue({
      id: '7001',
      status: 'running',
      scriptText: '已有口播稿',
      errorCode: null,
      errorMessage: null,
      updatedAt: '2026-03-25T00:00:02.000Z',
    });

    const mod = await import('./route');
    const res = await mod.GET(
      new Request('http://localhost/api/ai-digests/runs/5002'),
      { params: Promise.resolve({ runId: '5002' }) },
    );

    expect(await res.json()).toMatchObject({
      ok: true,
      data: {
        id: '5002',
        status: 'succeeded',
        candidateTotal: 12,
        selectedCount: 5,
        articleId: '9001',
        privateFmEnabled: true,
        privateFmEpisode: {
          id: '7001',
          status: 'running',
          hasScript: true,
          errorCode: null,
          errorMessage: null,
        },
      },
    });
    expect(getPrivateFmEpisodeByRunIdMock).toHaveBeenCalledWith(pool, '5002');
  });
});
