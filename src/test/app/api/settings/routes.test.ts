import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings, normalizePersistedSettings } from '../../../../features/settings/settingsSchema';

const client = {
  query: vi.fn(),
  release: vi.fn(),
};
const pool = {
  connect: vi.fn(),
};
const requireApiSessionMock = vi.fn();

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

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
}));
vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
}));

vi.mock('@/server/domains/settings/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
}));
vi.mock('@/server/domains/settings/repositories/settingsRepo', () => ({
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
  updateUiSettings: (...args: unknown[]) => updateUiSettingsMock(...args),
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
}));

vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));
vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  updateAllFeedsFetchIntervalMinutes: (...args: unknown[]) =>
    updateAllFeedsFetchIntervalMinutesMock(...args),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  pruneAllFeedsArticlesToLimit: (...args: unknown[]) => pruneAllFeedsArticlesToLimitMock(...args),
}));
vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  pruneAllFeedsArticlesToLimit: (...args: unknown[]) => pruneAllFeedsArticlesToLimitMock(...args),
}));

vi.mock('@/server/infra/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('@/server/infra/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('@/server/infra/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));
vi.mock('@/server/infra/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));

vi.mock('@/server/integrations/ai/cleanupAiRuntimeState', () => ({
  cleanupAiRuntimeState: (...args: unknown[]) => cleanupAiRuntimeStateMock(...args),
}));
vi.mock('@/server/integrations/ai/cleanupAiRuntimeState', () => ({
  cleanupAiRuntimeState: (...args: unknown[]) => cleanupAiRuntimeStateMock(...args),
}));

describe('/api/settings', () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset().mockResolvedValue({
      userId: '1',
      role: 'admin',
      sessionVersion: 1,
    });
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

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.general.theme).toBe('dark');
    expect(json.data.ai).toEqual(defaultPersistedSettings.ai);
    expect(Array.isArray(json.data.categories)).toBe(true);
    expect(json.data.logging).toEqual(defaultPersistedSettings.logging);
  });

  it.each([
    ['malformed JSON', '{'],
    ['empty body', ''],
    ['null', 'null'],
    ['array', '[]'],
    ['primitive', 'true'],
    ['empty object', '{}'],
    ['partial settings', JSON.stringify({ general: { theme: 'dark' } })],
    ['missing nested fields', JSON.stringify({ ...defaultPersistedSettings, ai: {} })],
    ['missing retention limit', JSON.stringify({
      ...defaultPersistedSettings,
      rss: { ...defaultPersistedSettings.rss, maxStoredArticlesPerFeed: undefined },
    })],
    ['missing translation fields', JSON.stringify({
      ...defaultPersistedSettings,
      ai: { ...defaultPersistedSettings.ai, translation: {} },
    })],
    ['invalid theme', JSON.stringify({
      ...defaultPersistedSettings,
      general: { ...defaultPersistedSettings.general, theme: 'invalid' },
    })],
    ['invalid fetch interval', JSON.stringify({
      ...defaultPersistedSettings,
      rss: { ...defaultPersistedSettings.rss, fetchIntervalMinutes: 999 },
    })],
    ['invalid log retention', JSON.stringify({
      ...defaultPersistedSettings,
      logging: { ...defaultPersistedSettings.logging, retentionDays: 999 },
    })],
    ['invalid log level', JSON.stringify({
      ...defaultPersistedSettings,
      logging: { ...defaultPersistedSettings.logging, minLevel: 'debug' },
    })],
    ['invalid retention limit', JSON.stringify({
      ...defaultPersistedSettings,
      rss: { ...defaultPersistedSettings.rss, maxStoredArticlesPerFeed: 999 },
    })],
    ['wrong boolean type', JSON.stringify({
      ...defaultPersistedSettings,
      ai: { ...defaultPersistedSettings.ai, summaryEnabled: 'true' },
    })],
    ['unknown field', JSON.stringify({ ...defaultPersistedSettings, appearance: {} })],
    ['unknown nested field', JSON.stringify({
      ...defaultPersistedSettings,
      ai: { ...defaultPersistedSettings.ai, apiKey: 'secret' },
    })],
    ['invalid pane width', JSON.stringify({
      ...defaultPersistedSettings,
      general: { ...defaultPersistedSettings.general, leftPaneWidth: 9999 },
    })],
    ['invalid AI URL', JSON.stringify({
      ...defaultPersistedSettings,
      ai: { ...defaultPersistedSettings.ai, apiBaseUrl: 'not-a-url' },
    })],
    ['invalid RSS source', JSON.stringify({
      ...defaultPersistedSettings,
      rss: { ...defaultPersistedSettings.rss, sources: [null] },
    })],
    ['invalid RSS URL protocol', JSON.stringify({
      ...defaultPersistedSettings,
      rss: {
        ...defaultPersistedSettings.rss,
        sources: [{ id: 'source-1', name: 'RSS', url: 'file:///rss.xml', category: null, enabled: true }],
      },
    })],
    ['invalid category', JSON.stringify({
      ...defaultPersistedSettings,
      categories: [{ id: 'cat-1', name: '' }],
    })],
    ['invalid keyword type', JSON.stringify({
      ...defaultPersistedSettings,
      rss: {
        ...defaultPersistedSettings.rss,
        articleFilter: {
          ...defaultPersistedSettings.rss.articleFilter,
          keyword: { enabled: true, keywords: [123] },
        },
      },
    })],
  ])('PUT rejects %s before changing settings or runtime state', async (_name, body) => {
    // 模拟已有较高留存上限和有效 AI 配置，防止无效请求回退默认值后触发破坏性清理。
    getUiSettingsMock.mockResolvedValue(normalizePersistedSettings({
      rss: { maxStoredArticlesPerFeed: 2000 },
      ai: { model: 'configured-model', apiBaseUrl: 'https://ai.example.com/v1' },
    }));
    updateUiSettingsMock.mockResolvedValue(defaultPersistedSettings);

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.PUT(new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body,
    }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toMatchObject({ ok: false, error: { code: 'validation_error' } });
    expect(json.error.fields).toBeDefined();
    expect(getUiSettingsMock).not.toHaveBeenCalled();
    expect(getAiApiKeyMock).not.toHaveBeenCalled();
    expect(getTranslationApiKeyMock).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
    expect(updateUiSettingsMock).not.toHaveBeenCalled();
    expect(updateAllFeedsFetchIntervalMinutesMock).not.toHaveBeenCalled();
    expect(pruneAllFeedsArticlesToLimitMock).not.toHaveBeenCalled();
    expect(cleanupAiRuntimeStateMock).not.toHaveBeenCalled();
    expect(writeUserOperationSucceededLogMock).not.toHaveBeenCalled();
    expect(writeSystemLogMock).not.toHaveBeenCalled();
  });

  it('PUT saves complete settings without resetting unrelated configuration', async () => {
    const payload = structuredClone(defaultPersistedSettings);
    payload.general.theme = 'dark';
    payload.ai.model = 'configured-model';
    payload.ai.apiBaseUrl = 'https://ai.example.com/v1';
    payload.ai.translation = {
      useSharedAi: false,
      model: 'translation-model',
      apiBaseUrl: 'https://translation.example.com/v1',
    };
    payload.categories = [{ id: 'tech', name: '科技' }];
    payload.rss.sources = [{
      id: 'source-1', name: '技术资讯', url: 'https://example.com/rss.xml', category: '科技', enabled: true,
    }];
    payload.rss.maxStoredArticlesPerFeed = 2000;
    payload.rss.articleFilter.keyword = { enabled: true, keywords: ['广告', '招聘'] };
    payload.rss.articleFilter.ai = { enabled: true, prompt: '过滤广告文章' };
    payload.logging = { enabled: true, retentionDays: 30, minLevel: 'warning' };
    getUiSettingsMock.mockResolvedValue({
      ...payload,
      general: { ...payload.general, theme: 'light' },
    });
    // 仓储原样返回实际提交值，避免固定返回值掩盖写入过程中对其他设置的意外修改。
    updateUiSettingsMock.mockImplementation(async (_client, _userId, settings) => settings);

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.PUT(new Request('http://localhost/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: payload });
    expect(updateUiSettingsMock).toHaveBeenCalledWith(client, '1', payload);
    expect(pruneAllFeedsArticlesToLimitMock).not.toHaveBeenCalled();
    expect(cleanupAiRuntimeStateMock).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('commit');
  });

  it('PUT updates all feeds when rss.fetchIntervalMinutes changes', async () => {
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30 } });

    const payload = {
      rss: { fetchIntervalMinutes: 60 },
      logging: { enabled: true, retentionDays: 14, minLevel: 'warning' },
    };
    const normalized = normalizePersistedSettings(payload);
    updateUiSettingsMock.mockResolvedValue(normalized);

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings(payload)),
      }),
    );
    const json = await res.json();

    expect(updateUiSettingsMock).toHaveBeenCalledWith(client, '1', normalized);
    expect(updateAllFeedsFetchIntervalMinutesMock).toHaveBeenCalledWith(client, 60, '1');
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

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings(payload)),
      }),
    );
    const json = await res.json();

    expect(pruneAllFeedsArticlesToLimitMock).toHaveBeenCalledWith(client, 1000, '1');
    expect(json.ok).toBe(true);
    expect(
      (json.data.rss as { maxStoredArticlesPerFeed?: number }).maxStoredArticlesPerFeed,
    ).toBe(1000);
  });

  it('PUT scopes feed interval updates to the current user', async () => {
    requireApiSessionMock.mockResolvedValue({
      userId: '2',
      role: 'member',
      sessionVersion: 1,
    });
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30 } });

    const payload = {
      rss: { fetchIntervalMinutes: 60 },
    };
    const normalized = normalizePersistedSettings(payload);
    updateUiSettingsMock.mockResolvedValue(normalized);

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings(payload)),
      }),
    );

    expect(updateAllFeedsFetchIntervalMinutesMock).toHaveBeenCalledWith(client, 60, '2');
  });

  it('PUT does not update all feeds when only general.theme changes', async () => {
    getUiSettingsMock.mockResolvedValue({ rss: { fetchIntervalMinutes: 30 }, general: { theme: 'dark' } });

    const payload = { general: { theme: 'light' }, rss: { fetchIntervalMinutes: 30 } };
    const normalized = normalizePersistedSettings(payload);
    updateUiSettingsMock.mockResolvedValue(normalized);

    const mod = await import('../../../../app/api/settings/route');
    const res = await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings(payload)),
      }),
    );
    const json = await res.json();

    expect(updateUiSettingsMock).toHaveBeenCalledWith(client, '1', normalized);
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({ logging: { enabled: true, retentionDays: 7, minLevel: 'info' } })),
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({ logging: { enabled: false, retentionDays: 7, minLevel: 'info' } })),
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({ logging: { enabled: true, retentionDays: 30, minLevel: 'info' } })),
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({ logging: { enabled: false, retentionDays: 30, minLevel: 'info' } })),
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({
          ai: {
            model: 'gpt-new',
            apiBaseUrl: 'https://new.example.com/v1',
            translation: {
              useSharedAi: true,
              model: '',
              apiBaseUrl: '',
            },
          },
        })),
      }),
    );

    expect(cleanupAiRuntimeStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        userId: '1',
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

    const mod = await import('../../../../app/api/settings/route');
    await mod.PUT(
      new Request('http://localhost/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(normalizePersistedSettings({
          ai: {
            model: 'gpt-shared',
            apiBaseUrl: 'https://shared.example.com/v1',
            translation: {
              useSharedAi: false,
              model: 'gpt-translation-new',
              apiBaseUrl: 'https://translation-new.example.com/v1',
            },
          },
        })),
      }),
    );

    expect(cleanupAiRuntimeStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        pool,
        userId: '1',
        scopes: {
          summary: false,
          translation: true,
          digest: false,
        },
      }),
    );
  });
});
