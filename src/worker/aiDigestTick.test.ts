import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiApiKeyMock = vi.fn();
const getUiSettingsMock = vi.fn();
const listDueAiDigestConfigFeedIdsMock = vi.fn();
const getAiDigestConfigByFeedIdMock = vi.fn();
const getActiveAiDigestRunByFeedIdMock = vi.fn();
const getAiDigestRunByFeedIdAndWindowStartAtMock = vi.fn();
const createAiDigestRunMock = vi.fn();
const updateAiDigestRunMock = vi.fn();

vi.mock('../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
}));

vi.mock('../server/repositories/aiDigestRepo', () => ({
  listDueAiDigestConfigFeedIds: (...args: unknown[]) => listDueAiDigestConfigFeedIdsMock(...args),
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  getActiveAiDigestRunByFeedId: (...args: unknown[]) => getActiveAiDigestRunByFeedIdMock(...args),
  getAiDigestRunByFeedIdAndWindowStartAt: (...args: unknown[]) =>
    getAiDigestRunByFeedIdAndWindowStartAtMock(...args),
  createAiDigestRun: (...args: unknown[]) => createAiDigestRunMock(...args),
  updateAiDigestRun: (...args: unknown[]) => updateAiDigestRunMock(...args),
}));

describe('runAiDigestTick', () => {
  beforeEach(() => {
    getAiApiKeyMock.mockReset();
    getUiSettingsMock.mockReset().mockResolvedValue({});
    listDueAiDigestConfigFeedIdsMock.mockReset();
    getAiDigestConfigByFeedIdMock.mockReset();
    getActiveAiDigestRunByFeedIdMock.mockReset();
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
      intervalMinutes: 240,
    });
    getActiveAiDigestRunByFeedIdMock.mockResolvedValue(null);
    getAiDigestRunByFeedIdAndWindowStartAtMock.mockResolvedValue(null);
    createAiDigestRunMock.mockResolvedValue({
      id: 'run-1',
      status: 'queued',
    });

    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const pool = { query: vi.fn() };

    const { runAiDigestTick } = await import('./aiDigestTick');
    await runAiDigestTick({ boss: boss as never, pool: pool as never, now: new Date('2026-03-15T08:30:00.000Z') });

    expect(createAiDigestRunMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        windowStartAt: '2026-03-15T04:30:00.000Z',
        windowEndAt: '2026-03-15T08:30:00.000Z',
      }),
    );
    expect(boss.send).toHaveBeenCalledTimes(1);
    expect(updateAiDigestRunMock).toHaveBeenCalledWith(pool, 'run-1', { jobId: 'job-1' });
  });

  it('skips a due config when that digest feed already has an active run', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    listDueAiDigestConfigFeedIdsMock.mockResolvedValue(['feed-1']);
    getAiDigestConfigByFeedIdMock.mockResolvedValue({
      feedId: 'feed-1',
      lastWindowEndAt: '2026-03-14T00:00:00.000Z',
      intervalMinutes: 60,
    });
    getActiveAiDigestRunByFeedIdMock.mockResolvedValue({
      id: 'active-run-1',
      status: 'queued',
    });

    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const pool = { query: vi.fn() };

    const { runAiDigestTick } = await import('./aiDigestTick');
    await runAiDigestTick({ boss: boss as never, pool: pool as never, now: new Date('2026-03-15T08:30:00.000Z') });

    expect(createAiDigestRunMock).not.toHaveBeenCalled();
    expect(boss.send).not.toHaveBeenCalled();
  });
});
