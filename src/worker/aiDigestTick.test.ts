import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiApiKeyMock = vi.fn();
const listDueAiDigestConfigFeedIdsMock = vi.fn();
const getAiDigestConfigByFeedIdMock = vi.fn();
const getAiDigestRunByFeedIdAndWindowStartAtMock = vi.fn();
const createAiDigestRunMock = vi.fn();
const updateAiDigestRunMock = vi.fn();

vi.mock('../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));

vi.mock('../server/repositories/aiDigestRepo', () => ({
  listDueAiDigestConfigFeedIds: (...args: unknown[]) => listDueAiDigestConfigFeedIdsMock(...args),
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  getAiDigestRunByFeedIdAndWindowStartAt: (...args: unknown[]) =>
    getAiDigestRunByFeedIdAndWindowStartAtMock(...args),
  createAiDigestRun: (...args: unknown[]) => createAiDigestRunMock(...args),
  updateAiDigestRun: (...args: unknown[]) => updateAiDigestRunMock(...args),
}));

describe('runAiDigestTick', () => {
  beforeEach(() => {
    getAiApiKeyMock.mockReset();
    listDueAiDigestConfigFeedIdsMock.mockReset();
    getAiDigestConfigByFeedIdMock.mockReset();
    getAiDigestRunByFeedIdAndWindowStartAtMock.mockReset();
    createAiDigestRunMock.mockReset();
    updateAiDigestRunMock.mockReset();
  });

  it('skips when API key is missing', async () => {
    getAiApiKeyMock.mockResolvedValue('');

    const boss = { send: vi.fn() };
    const pool = { query: vi.fn() };

    const { runAiDigestTick } = await import('./aiDigestTick');
    await runAiDigestTick({ boss: boss as never, pool: pool as never, now: new Date('2026-03-14T00:00:00.000Z') });

    expect(boss.send).not.toHaveBeenCalled();
    expect(listDueAiDigestConfigFeedIdsMock).not.toHaveBeenCalled();
  });

  it('enqueues ai.digest_generate for due configs', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    listDueAiDigestConfigFeedIdsMock.mockResolvedValue(['feed-1']);
    getAiDigestConfigByFeedIdMock.mockResolvedValue({
      feedId: 'feed-1',
      lastWindowEndAt: '2026-03-14T00:00:00.000Z',
    });
    getAiDigestRunByFeedIdAndWindowStartAtMock.mockResolvedValue(null);
    createAiDigestRunMock.mockResolvedValue({
      id: 'run-1',
      status: 'queued',
    });

    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const pool = { query: vi.fn() };

    const { runAiDigestTick } = await import('./aiDigestTick');
    await runAiDigestTick({ boss: boss as never, pool: pool as never, now: new Date('2026-03-14T00:01:00.000Z') });

    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(updateAiDigestRunMock).toHaveBeenCalledWith(pool, 'run-1', { jobId: 'job-1' });
  });
});
