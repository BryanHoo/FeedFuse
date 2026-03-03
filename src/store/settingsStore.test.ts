import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from './settingsStore';
import { defaultPersistedSettings } from '../features/settings/settingsSchema';

describe('settingsStore', () => {
  let remoteHasApiKey = false;
  let remoteHasTranslationApiKey = false;

  beforeEach(() => {
    remoteHasApiKey = false;
    remoteHasTranslationApiKey = false;

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
        const url = typeof _input === 'string' ? _input : _input.toString();
        if (init?.method === 'PUT') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
          if (url.includes('/api/settings/ai/api-key')) {
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: Boolean(body.apiKey) } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          if (url.includes('/api/settings/translation/api-key')) {
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: Boolean(body.apiKey) } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return new Response(JSON.stringify({ ok: true, data: body }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (init?.method === 'DELETE' && url.includes('/api/settings/ai/api-key')) {
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

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const apiKeyCall = calls.find(([input, init]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.includes('/api/settings/ai/api-key') && init?.method === 'PUT';
    });
    expect(apiKeyCall).toBeTruthy();
    expect(apiKeyCall?.[1]?.body).toContain('sk-test');
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

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const translationApiKeyCall = calls.find(([input, init]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.includes('/api/settings/translation/api-key') && init?.method === 'PUT';
    });

    expect(translationApiKeyCall).toBeTruthy();
    expect(translationApiKeyCall?.[1]?.body).toContain('sk-translation-test');
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

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const deleteCall = calls.find(([input, init]) => {
      const url = typeof input === 'string' ? input : input.toString();
      return url.includes('/api/settings/ai/api-key') && init?.method === 'DELETE';
    });

    expect(deleteCall).toBeTruthy();
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
