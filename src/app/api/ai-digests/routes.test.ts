import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueueSendOptions } from '../../../server/queue/contracts';
import { JOB_AI_DIGEST_GENERATE } from '../../../server/queue/jobs';

const pool = { connect: vi.fn(), query: vi.fn() };
const createAiDigestWithCategoryResolutionMock = vi.fn();

const getAiApiKeyMock = vi.fn();
const getAiDigestConfigByFeedIdMock = vi.fn();
const createAiDigestRunMock = vi.fn();
const getAiDigestRunByFeedIdAndWindowStartAtMock = vi.fn();
const updateAiDigestRunMock = vi.fn();
const enqueueWithResultMock = vi.fn();

vi.mock('../../../server/db/pool', () => ({ getPool: () => pool }));
vi.mock('../../../../server/db/pool', () => ({ getPool: () => pool }));
vi.mock('../../../../../server/db/pool', () => ({ getPool: () => pool }));

vi.mock('../../../server/services/aiDigestLifecycleService', () => ({
  createAiDigestWithCategoryResolution: (...args: unknown[]) =>
    createAiDigestWithCategoryResolutionMock(...args),
}));
vi.mock('../../../../server/services/aiDigestLifecycleService', () => ({
  createAiDigestWithCategoryResolution: (...args: unknown[]) =>
    createAiDigestWithCategoryResolutionMock(...args),
}));

vi.mock('../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));
vi.mock('../../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));
vi.mock('../../../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));

vi.mock('../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  createAiDigestRun: (...args: unknown[]) => createAiDigestRunMock(...args),
  getAiDigestRunByFeedIdAndWindowStartAt: (...args: unknown[]) =>
    getAiDigestRunByFeedIdAndWindowStartAtMock(...args),
  updateAiDigestRun: (...args: unknown[]) => updateAiDigestRunMock(...args),
}));
vi.mock('../../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  createAiDigestRun: (...args: unknown[]) => createAiDigestRunMock(...args),
  getAiDigestRunByFeedIdAndWindowStartAt: (...args: unknown[]) =>
    getAiDigestRunByFeedIdAndWindowStartAtMock(...args),
  updateAiDigestRun: (...args: unknown[]) => updateAiDigestRunMock(...args),
}));
vi.mock('../../../../../server/repositories/aiDigestRepo', () => ({
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  createAiDigestRun: (...args: unknown[]) => createAiDigestRunMock(...args),
  getAiDigestRunByFeedIdAndWindowStartAt: (...args: unknown[]) =>
    getAiDigestRunByFeedIdAndWindowStartAtMock(...args),
  updateAiDigestRun: (...args: unknown[]) => updateAiDigestRunMock(...args),
}));

vi.mock('../../../server/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));
vi.mock('../../../../server/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));
vi.mock('../../../../../server/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

describe('/api/ai-digests', () => {
  beforeEach(() => {
    pool.connect.mockReset();
    pool.query.mockReset();
    createAiDigestWithCategoryResolutionMock.mockReset();
  });

  it('POST creates ai_digest feed and returns unreadCount=0', async () => {
    createAiDigestWithCategoryResolutionMock.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000000',
      kind: 'ai_digest',
      title: 'My Digest',
      url: 'http://localhost/__feedfuse_ai_digest__/00000000-0000-0000-0000-000000000000',
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
    const res = await mod.POST(
      new Request('http://localhost/api/ai-digests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'My Digest',
          prompt: '解读这些文章',
          intervalMinutes: 60,
          selectedFeedIds: ['22222222-2222-2222-8222-222222222222'],
          categoryName: 'Tech',
        }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.unreadCount).toBe(0);
    expect(json.data.kind).toBe('ai_digest');
    expect(createAiDigestWithCategoryResolutionMock).toHaveBeenCalledWith(
      pool,
      expect.not.objectContaining({ feedId: expect.anything() }),
    );
  });

  it('POST rejects selectedCategoryIds', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/ai-digests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'My Digest',
          prompt: '解读这些文章',
          intervalMinutes: 60,
          selectedFeedIds: ['22222222-2222-2222-8222-222222222222'],
          selectedCategoryIds: [],
        }),
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe('/api/ai-digests/:feedId/generate', () => {
  beforeEach(() => {
    getAiApiKeyMock.mockReset();
    getAiDigestConfigByFeedIdMock.mockReset();
    createAiDigestRunMock.mockReset();
    getAiDigestRunByFeedIdAndWindowStartAtMock.mockReset();
    updateAiDigestRunMock.mockReset();
    enqueueWithResultMock.mockReset();
  });

  it('returns missing_api_key and does not create runs', async () => {
    getAiApiKeyMock.mockResolvedValue('');

    const mod = await import('./[feedId]/generate/route');
    const res = await mod.POST(
      new Request('http://localhost/api/ai-digests/x/generate', { method: 'POST' }),
      { params: Promise.resolve({ feedId: '00000000-0000-1000-8000-000000000000' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
    expect(json.data.reason).toBe('missing_api_key');
    expect(createAiDigestRunMock).not.toHaveBeenCalled();
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('enqueues ai.digest_generate when config exists and not already running', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getAiDigestConfigByFeedIdMock.mockResolvedValue({
      feedId: '00000000-0000-1000-8000-000000000000',
      lastWindowEndAt: '2026-03-14T00:00:00.000Z',
    });
    getAiDigestRunByFeedIdAndWindowStartAtMock.mockResolvedValue(null);
    createAiDigestRunMock.mockResolvedValue({
      id: '11111111-1111-1111-8111-111111111111',
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-1' });

    const mod = await import('./[feedId]/generate/route');
    const res = await mod.POST(
      new Request('http://localhost/api/ai-digests/x/generate', { method: 'POST' }),
      { params: Promise.resolve({ feedId: '00000000-0000-1000-8000-000000000000' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      JOB_AI_DIGEST_GENERATE,
      { runId: '11111111-1111-1111-8111-111111111111' },
      getQueueSendOptions(JOB_AI_DIGEST_GENERATE, { runId: '11111111-1111-1111-8111-111111111111' }),
    );
  });
});
