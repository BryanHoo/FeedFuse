import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings, normalizePersistedSettings } from '../../../features/settings/settingsSchema';

const client = {
  query: vi.fn(),
  release: vi.fn(),
};
const pool = {
  connect: vi.fn(),
};

const getUiSettingsMock = vi.fn();
const updateUiSettingsMock = vi.fn();
const updateAllFeedsFetchIntervalMinutesMock = vi.fn();

vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../server/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
}));
vi.mock('../../../../server/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
}));

vi.mock('../../../server/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));
vi.mock('../../../../server/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));

describe('/api/settings', () => {
  beforeEach(() => {
    getUiSettingsMock.mockReset();
    updateUiSettingsMock.mockReset();
    updateAllFeedsFetchIntervalMinutesMock.mockReset();
    client.query.mockReset().mockResolvedValue({ rows: [] });
    client.release.mockReset();
    pool.connect.mockReset().mockResolvedValue(client);
  });

  it('GET returns normalized persisted settings', async () => {
    getUiSettingsMock.mockResolvedValue({ appearance: { theme: 'dark' } });

    const mod = await import('./route');
    const res = await mod.GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.general.theme).toBe('dark');
    expect(json.data.ai).toEqual(defaultPersistedSettings.ai);
    expect(Array.isArray(json.data.categories)).toBe(true);
    expect(json.data.logging).toEqual(defaultPersistedSettings.logging);
  });

  it('PUT updates all feeds when rss.fetchIntervalMinutes changes', async () => {
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30 } });

    const payload = { rss: { fetchIntervalMinutes: 60 }, logging: { enabled: true, retentionDays: 14 } };
    const normalized = normalizePersistedSettings(payload);
    updateUiSettingsMock.mockResolvedValue(normalized);

    const mod = await import('./route');
    const res = await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    const json = await res.json();

    expect(updateUiSettingsMock).toHaveBeenCalledWith(client, normalized);
    expect(updateAllFeedsFetchIntervalMinutesMock).toHaveBeenCalledWith(client, 60);
    expect(json.ok).toBe(true);
    expect(json.data.rss.fetchIntervalMinutes).toBe(60);
    expect(json.data.logging).toEqual({ enabled: true, retentionDays: 14 });
  });

  it('PUT does not update all feeds when only general.theme changes', async () => {
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30 }, general: { theme: 'dark' } });

    const payload = { general: { theme: 'light' }, rss: { fetchIntervalMinutes: 30 } };
    const normalized = normalizePersistedSettings(payload);
    updateUiSettingsMock.mockResolvedValue(normalized);

    const mod = await import('./route');
    const res = await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    );
    const json = await res.json();

    expect(updateUiSettingsMock).toHaveBeenCalledWith(client, normalized);
    expect(updateAllFeedsFetchIntervalMinutesMock).not.toHaveBeenCalled();
    expect(json.ok).toBe(true);
    expect(json.data.general.theme).toBe('light');
  });
});
