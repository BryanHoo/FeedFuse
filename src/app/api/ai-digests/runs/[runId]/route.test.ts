import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const getAiDigestRunByIdMock = vi.fn();

vi.mock('../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestRunById: (...args: unknown[]) => getAiDigestRunByIdMock(...args),
}));

describe('/api/ai-digests/runs/[runId]', () => {
  beforeEach(() => {
    getAiDigestRunByIdMock.mockReset();
  });

  it('GET returns stable terminal fields for a failed run', async () => {
    getAiDigestRunByIdMock.mockResolvedValue({
      id: '5001',
      status: 'failed',
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
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
      },
    });
  });
});
