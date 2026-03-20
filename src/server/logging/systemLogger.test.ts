import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUiSettingsMock = vi.fn();
const insertSystemLogMock = vi.fn();

vi.mock('../repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
}));

vi.mock('../repositories/systemLogsRepo', () => ({
  insertSystemLog: (...args: unknown[]) => insertSystemLogMock(...args),
}));

describe('systemLogger', () => {
  beforeEach(() => {
    getUiSettingsMock.mockReset();
    insertSystemLogMock.mockReset();
  });

  it('skips insert when logging is disabled', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } });

    const mod = await import('./systemLogger');
    const result = await mod.writeSystemLog(
      {} as never,
      { level: 'info', category: 'settings', source: 'route', message: 'x' },
    );

    expect(result).toEqual({ written: false });
    expect(insertSystemLogMock).not.toHaveBeenCalled();
  });

  it('skips info logs when minLevel is warning', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: true, retentionDays: 7, minLevel: 'warning' } });

    const mod = await import('./systemLogger');
    const result = await mod.writeSystemLog(
      {} as never,
      { level: 'info', category: 'settings', source: 'route', message: 'x' },
    );

    expect(result).toEqual({ written: false });
    expect(insertSystemLogMock).not.toHaveBeenCalled();
  });

  it('force writes boundary logs even when logging is disabled', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7, minLevel: 'error' } });

    const mod = await import('./systemLogger');
    const result = await mod.writeSystemLog(
      {} as never,
      { level: 'info', category: 'settings', source: 'route', message: 'Logging enabled' },
      { forceWrite: true },
    );

    expect(result).toEqual({ written: true });
    expect(insertSystemLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: 'Logging enabled',
        details: null,
        context: {},
      }),
    );
  });
});
