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
const getAiApiKeyMock = vi.fn();
const getTranslationApiKeyMock = vi.fn();
const updateAllFeedsFetchIntervalMinutesMock = vi.fn();
const pruneAllFeedsArticlesToLimitMock = vi.fn();
const writeSystemLogMock = vi.fn();
const cleanupAiRuntimeStateMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../server/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
}));
vi.mock('../../../../server/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
}));

vi.mock('../../../server/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));
vi.mock('../../../../server/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));

vi.mock('../../../server/repositories/articlesRepo', () => ({
  pruneAllFeedsArticlesToLimit: (...args: unknown[]) => pruneAllFeedsArticlesToLimitMock(...args),
}));
vi.mock('../../../../server/repositories/articlesRepo', () => ({
  pruneAllFeedsArticlesToLimit: (...args: unknown[]) => pruneAllFeedsArticlesToLimitMock(...args),
}));

vi.mock('../../../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('../../../../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));
vi.mock('../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));

vi.mock('../../../server/ai/cleanupAiRuntimeState', () => ({
  cleanupAiRuntimeState: (...args: unknown[]) => cleanupAiRuntimeStateMock(...args),
}));
vi.mock('../../../../server/ai/cleanupAiRuntimeState', () => ({
  cleanupAiRuntimeState: (...args: unknown[]) => cleanupAiRuntimeStateMock(...args),
}));

describe('/api/settings', () => {
  beforeEach(() => {
    getUiSettingsMock.mockReset();
    updateUiSettingsMock.mockReset();
    getAiApiKeyMock.mockReset().mockResolvedValue('sk-shared');
    getTranslationApiKeyMock.mockReset().mockResolvedValue('sk-translation');
    updateAllFeedsFetchIntervalMinutesMock.mockReset();
    pruneAllFeedsArticlesToLimitMock.mockReset();
    writeSystemLogMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
    cleanupAiRuntimeStateMock.mockReset().mockResolvedValue({
      summarySessions: 0,
      translationSessions: 0,
      digestRuns: 0,
      taskRows: 0,
    });
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

    const payload = {
      rss: { fetchIntervalMinutes: 60 },
      logging: { enabled: true, retentionDays: 14, minLevel: 'warning' },
    };
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
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ actionKey: 'settings.save' }),
    );
    expect(json.ok).toBe(true);
    expect(json.data.rss.fetchIntervalMinutes).toBe(60);
    expect(json.data.logging).toEqual({ enabled: true, retentionDays: 14, minLevel: 'warning' });
  });

  it('PUT prunes existing feed articles when rss.maxStoredArticlesPerFeed changes', async () => {
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30, maxStoredArticlesPerFeed: 500 } });

    const payload = {
      rss: { fetchIntervalMinutes: 30, maxStoredArticlesPerFeed: 1000 },
    };
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

    expect(pruneAllFeedsArticlesToLimitMock).toHaveBeenCalledWith(client, 1000);
    expect(json.ok).toBe(true);
    expect(
      (json.data.rss as { maxStoredArticlesPerFeed?: number }).maxStoredArticlesPerFeed,
    ).toBe(1000);
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
    expect(pruneAllFeedsArticlesToLimitMock).not.toHaveBeenCalled();
    expect(json.ok).toBe(true);
    expect(json.data.general.theme).toBe('light');
  });

  it('writes Logging enabled when settings save turns logging on', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({ logging: { enabled: true, retentionDays: 7, minLevel: 'info' } }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logging: { enabled: true, retentionDays: 7, minLevel: 'info' } }),
      }),
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ message: 'Logging enabled' }),
      expect.objectContaining({ forceWrite: true }),
    );
  });

  it('writes Logging disabled as the last forced boundary log when settings save turns logging off', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: true, retentionDays: 7, minLevel: 'info' } });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } }),
      }),
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ message: 'Logging disabled' }),
      expect.objectContaining({ forceWrite: true }),
    );
  });

  it('records retentionDays changes only while logging stays enabled', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: true, retentionDays: 7, minLevel: 'info' } });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({ logging: { enabled: true, retentionDays: 30, minLevel: 'info' } }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logging: { enabled: true, retentionDays: 30, minLevel: 'info' } }),
      }),
    );

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        message: 'Log retention days updated',
        context: { retentionDays: 30 },
      }),
      undefined,
    );
  });

  it('does not write retentionDays change logs while logging remains disabled', async () => {
    getUiSettingsMock.mockResolvedValue({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({ logging: { enabled: false, retentionDays: 30, minLevel: 'info' } }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logging: { enabled: false, retentionDays: 30, minLevel: 'info' } }),
      }),
    );

    expect(writeSystemLogMock).not.toHaveBeenCalledWith(
      client,
      expect.objectContaining({ message: 'Log retention days updated' }),
      expect.anything(),
    );
  });

  it('cleans running AI tasks when shared AI config changes', async () => {
    getUiSettingsMock.mockResolvedValue({
      ai: {
        model: 'gpt-old',
        apiBaseUrl: 'https://old.example.com/v1',
        translation: {
          useSharedAi: true,
          model: '',
          apiBaseUrl: '',
        },
      },
    });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({
        ai: {
          model: 'gpt-new',
          apiBaseUrl: 'https://new.example.com/v1',
          translation: {
            useSharedAi: true,
            model: '',
            apiBaseUrl: '',
          },
        },
      }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ai: {
            model: 'gpt-new',
            apiBaseUrl: 'https://new.example.com/v1',
            translation: {
              useSharedAi: true,
              model: '',
              apiBaseUrl: '',
            },
          },
        }),
      }),
    );

    expect(cleanupAiRuntimeStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        scopes: {
          summary: true,
          translation: true,
          digest: true,
        },
      }),
    );
  });

  it('cleans only translation tasks when dedicated translation config changes', async () => {
    getUiSettingsMock.mockResolvedValue({
      ai: {
        model: 'gpt-shared',
        apiBaseUrl: 'https://shared.example.com/v1',
        translation: {
          useSharedAi: false,
          model: 'gpt-translation-old',
          apiBaseUrl: 'https://translation-old.example.com/v1',
        },
      },
    });
    updateUiSettingsMock.mockResolvedValue(
      normalizePersistedSettings({
        ai: {
          model: 'gpt-shared',
          apiBaseUrl: 'https://shared.example.com/v1',
          translation: {
            useSharedAi: false,
            model: 'gpt-translation-new',
            apiBaseUrl: 'https://translation-new.example.com/v1',
          },
        },
      }),
    );

    const mod = await import('./route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ai: {
            model: 'gpt-shared',
            apiBaseUrl: 'https://shared.example.com/v1',
            translation: {
              useSharedAi: false,
              model: 'gpt-translation-new',
              apiBaseUrl: 'https://translation-new.example.com/v1',
            },
          },
        }),
      }),
    );

    expect(cleanupAiRuntimeStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        scopes: {
          summary: false,
          translation: true,
          digest: false,
        },
      }),
    );
  });
});
