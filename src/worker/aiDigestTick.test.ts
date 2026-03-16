import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAiApiKeyMock = vi.fn();
const listDueAiDigestConfigFeedIdsMock = vi.fn();

vi.mock('../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));

vi.mock('../server/repositories/aiDigestRepo', () => ({
  listDueAiDigestConfigFeedIds: (...args: unknown[]) => listDueAiDigestConfigFeedIdsMock(...args),
}));

describe('runAiDigestTick', () => {
  beforeEach(() => {
    getAiApiKeyMock.mockReset();
    listDueAiDigestConfigFeedIdsMock.mockReset();
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
});

