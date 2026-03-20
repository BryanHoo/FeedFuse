import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from './settingsStore';
import { defaultPersistedSettings } from '../features/settings/settingsSchema';

function getFetchCallUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getFetchCallMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  return init?.method ?? 'GET';
}

async function getFetchCallBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.text();
    } catch {
      return undefined;
    }
  }
  return typeof init?.body === 'string' ? init.body : undefined;
}

describe('settingsStore', () => {
  let remoteHasApiKey = false;
  let remoteHasTranslationApiKey = false;
  let lastAiApiKeyPutBodyText: string | null = null;
  let lastTranslationApiKeyPutBodyText: string | null = null;
  let lastAiApiKeyDeleteCalled = false;
  let lastSettingsPutBodyText: string | null = null;

  beforeEach(() => {
    remoteHasApiKey = false;
    remoteHasTranslationApiKey = false;
    lastAiApiKeyPutBodyText = null;
    lastTranslationApiKeyPutBodyText = null;
    lastAiApiKeyDeleteCalled = false;
    lastSettingsPutBodyText = null;

    useSettingsStore.setState((state) => ({
      ...state,
      persistedSettings: structuredClone(defaultPersistedSettings),
      sessionSettings: { ai: { apiKey: '', hasApiKey: false, clearApiKey: false }, rssValidation: {} },
      draft: null,
      validationErrors: {},
      settings: {
        theme: defaultPersistedSettings.general.theme,
        fontSize: defaultPersistedSettings.general.fontSize,
        fontFamily: defaultPersistedSettings.general.fontFamily,
        lineHeight: defaultPersistedSettings.general.lineHeight,
      },
    }));
    window.localStorage.clear();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(_input);
        const method = getFetchCallMethod(_input, init);

        if (method === 'PUT') {
          const bodyText = await getFetchCallBodyText(_input, init);
          const body = typeof bodyText === 'string' ? JSON.parse(bodyText) : {};
          if (url.includes('/api/settings/ai/api-key')) {
            lastAiApiKeyPutBodyText = bodyText ?? null;
            remoteHasApiKey = Boolean(body.apiKey);
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: Boolean(body.apiKey) } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (url.includes('/api/settings/translation/api-key')) {
            lastTranslationApiKeyPutBodyText = bodyText ?? null;
            remoteHasTranslationApiKey = Boolean(body.apiKey);
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: Boolean(body.apiKey) } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (url.includes('/api/settings')) {
            lastSettingsPutBodyText = bodyText ?? null;
            return new Response(JSON.stringify({ ok: true, data: body }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ ok: true, data: body }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (method === 'DELETE' && url.includes('/api/settings/ai/api-key')) {
          lastAiApiKeyDeleteCalled = true;
          remoteHasApiKey = false;
          return new Response(JSON.stringify({ ok: true, data: { hasApiKey: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/settings/ai/api-key')) {
          return new Response(JSON.stringify({ ok: true, data: { hasApiKey: remoteHasApiKey } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/settings/translation/api-key')) {
          return new Response(
            JSON.stringify({ ok: true, data: { hasApiKey: remoteHasTranslationApiKey } }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url.includes('/api/settings')) {
          return new Response(JSON.stringify({ ok: true, data: structuredClone(defaultPersistedSettings) }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data: {} }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  it('saves apiKey to backend without persisting it to localStorage', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.apiKey = 'sk-test';
    });
    await useSettingsStore.getState().saveDraft();

    const raw = window.localStorage.getItem('feedfuse-settings');
    expect(raw).not.toContain('sk-test');

    expect(lastAiApiKeyPutBodyText).toContain('sk-test');
  });

  it('saves dedicated translation apiKey when translation uses dedicated config', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.ai.translation.useSharedAi = false;
      draft.persisted.ai.translation.apiBaseUrl = 'https://api.openai.com/v1';
      (draft.session.ai as typeof draft.session.ai & { translationApiKey: string }).translationApiKey =
        'sk-translation-test';
    });

    await useSettingsStore.getState().saveDraft();

    expect(lastTranslationApiKeyPutBodyText).toContain('sk-translation-test');
  });

  it('saves draft with rss sources without requiring per-row verification state', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.rss.sources = [
        {
          id: 'source-1',
          name: 'Tech Feed',
          url: 'https://example.com/rss.xml',
          category: null,
          enabled: true,
        },
      ];
    });

    const result = await useSettingsStore.getState().saveDraft();
    expect(result.ok).toBe(true);
    expect(useSettingsStore.getState().persistedSettings.rss.sources).toHaveLength(1);
  });

  it('persists rss articleFilter settings through settingsStore saveDraft', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.rss.articleFilter.keyword.enabled = true;
      draft.persisted.rss.articleFilter.keyword.keywords = ['广告', 'Sponsored'];
      draft.persisted.rss.articleFilter.ai.enabled = true;
      draft.persisted.rss.articleFilter.ai.prompt = '过滤广告和招聘';
    });

    await useSettingsStore.getState().saveDraft();

    expect(lastSettingsPutBodyText).toContain('"articleFilter"');
    expect(lastSettingsPutBodyText).toContain('"keywords":["广告","Sponsored"]');
    expect(lastSettingsPutBodyText).toContain('"prompt":"过滤广告和招聘"');
    expect(lastSettingsPutBodyText).not.toContain('feedKeywordsByFeedId');
  });

  it('persists logging settings through settingsStore saveDraft', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.logging.enabled = true;
      draft.persisted.logging.retentionDays = 14;
      draft.persisted.logging.minLevel = 'warning';
    });

    await useSettingsStore.getState().saveDraft();
    expect(lastSettingsPutBodyText).toContain(
      '"logging":{"enabled":true,"retentionDays":14,"minLevel":"warning"}',
    );
  });

  it('hydrates hasApiKey from backend', async () => {
    remoteHasApiKey = true;
    await useSettingsStore.getState().hydratePersistedSettings();

    expect(useSettingsStore.getState().sessionSettings.ai.hasApiKey).toBe(true);
  });

  it('clears apiKey via backend when requested', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.clearApiKey = true;
    });

    await useSettingsStore.getState().saveDraft();

    expect(lastAiApiKeyDeleteCalled).toBe(true);
  });

  it('migrates legacy appearance settings to general', async () => {
    const legacy = {
      state: {
        persistedSettings: {
          appearance: {
            theme: 'dark',
            fontSize: 'medium',
            fontFamily: 'sans',
            lineHeight: 'normal',
          },
          ai: structuredClone(defaultPersistedSettings.ai),
          categories: [],
          rss: {
            sources: [],
          },
        },
      },
      version: 2,
    };

    window.localStorage.setItem('feedfuse-settings', JSON.stringify(legacy));
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().persistedSettings.general.theme).toBe('dark');
  });
});
