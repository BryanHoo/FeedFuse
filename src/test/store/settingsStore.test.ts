import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsStore } from '../../store/settingsStore';
import { defaultPersistedSettings } from '../../features/settings/settingsSchema';
import type { PersistedSettings } from '../../types';

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
  let pendingSettingsPuts: Array<{
    body: PersistedSettings;
    respond: (ok?: boolean) => void;
  }> | null = null;

  beforeEach(() => {
    remoteHasApiKey = false;
    remoteHasTranslationApiKey = false;
    lastAiApiKeyPutBodyText = null;
    lastTranslationApiKeyPutBodyText = null;
    lastAiApiKeyDeleteCalled = false;
    lastSettingsPutBodyText = null;
    pendingSettingsPuts = null;

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
            // 手动释放响应，确定性地模拟请求期间继续编辑和多个保存排队。
            if (pendingSettingsPuts) {
              return new Promise<Response>((resolve) => {
                pendingSettingsPuts!.push({
                  body,
                  respond: (ok = true) => resolve(new Response(JSON.stringify(
                    ok ? { ok: true, data: body } : {
                      ok: false,
                      error: { code: 'save_failed', message: '保存失败' },
                    },
                  ), {
                    status: ok ? 200 : 500,
                    headers: { 'content-type': 'application/json' },
                  })),
                });
              });
            }
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

  it('保留保存较大字号期间改为较小字号的新草稿', async () => {
    pendingSettingsPuts = [];
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'large';
    });
    const saving = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));

    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'small';
    });
    pendingSettingsPuts[0].respond();
    expect((await saving).ok).toBe(true);
    expect(useSettingsStore.getState().persistedSettings.general.fontSize).toBe('large');
    expect(useSettingsStore.getState().draft?.persisted.general.fontSize).toBe('small');
  });

  it('串行保存，并在排队请求开始时读取最新草稿', async () => {
    pendingSettingsPuts = [];
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'large';
    });
    const firstSave = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'medium';
    });
    const secondSave = useSettingsStore.getState().saveDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'small';
    });
    // 让所有微任务执行完，确认首个请求未结束时没有第二个网络请求。
    await new Promise((resolve) => setTimeout(resolve, 0));
    const concurrentCount = pendingSettingsPuts.length;
    pendingSettingsPuts[0].respond();
    await firstSave;
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(2));
    const secondFontSize = pendingSettingsPuts[1].body.general.fontSize;
    pendingSettingsPuts[1].respond();
    await secondSave;

    expect(concurrentCount).toBe(1);
    expect(secondFontSize).toBe('small');
    expect(useSettingsStore.getState().persistedSettings.general.fontSize).toBe('small');
    expect(useSettingsStore.getState().draft?.persisted.general.fontSize).toBe('small');
  });

  it('保留保存期间新输入的两种密钥及 RSS 校验状态', async () => {
    pendingSettingsPuts = [];
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.apiKey = 'sk-old';
      draft.persisted.ai.translation.useSharedAi = false;
      draft.persisted.ai.translation.apiBaseUrl = 'https://api.example.com/v1';
      draft.session.ai.translationApiKey = 'sk-translation-old';
    });
    const saving = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.apiKey = 'sk-new';
      draft.session.ai.translationApiKey = 'sk-translation-new';
      draft.session.rssValidation.new = { status: 'validating', verifiedUrl: null };
    });
    pendingSettingsPuts[0].respond();
    await saving;

    const ai = useSettingsStore.getState().draft?.session.ai;
    expect(ai?.apiKey).toBe('sk-new');
    expect(ai?.translationApiKey).toBe('sk-translation-new');
    expect(ai?.hasApiKey).toBe(true);
    expect(ai?.hasTranslationApiKey).toBe(true);
    expect(useSettingsStore.getState().draft?.session.rssValidation.new.status).toBe('validating');
  });

  it('请求返回时清理已保存且未再次编辑的密钥，保留其他新修改', async () => {
    pendingSettingsPuts = [];
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.apiKey = 'sk-saved';
    });
    const saving = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'small';
    });
    pendingSettingsPuts[0].respond();
    await saving;

    expect(useSettingsStore.getState().draft?.session.ai.apiKey).toBe('');
    expect(useSettingsStore.getState().draft?.persisted.general.fontSize).toBe('small');
  });

  it.each([false, true])('旧响应不重建已放弃或重新打开的草稿（重新打开：%s）', async (reopen) => {
    pendingSettingsPuts = [];
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'large';
    });
    const saving = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));
    const queuedSave = useSettingsStore.getState().saveDraft();
    useSettingsStore.getState().discardDraft();
    if (reopen) {
      useSettingsStore.getState().loadDraft();
      useSettingsStore.getState().updateDraft((draft) => {
        draft.persisted.general.fontSize = 'small';
      });
    }
    pendingSettingsPuts[0].respond();
    await Promise.all([saving, queuedSave]);

    expect(pendingSettingsPuts).toHaveLength(1);
    if (reopen) {
      expect(useSettingsStore.getState().draft?.persisted.general.fontSize).toBe('small');
    } else {
      expect(useSettingsStore.getState().draft).toBeNull();
    }
  });

  it('保存失败后仍能继续保存新修改', async () => {
    pendingSettingsPuts = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useSettingsStore.getState().loadDraft();
    const firstSave = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(1));
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.general.fontSize = 'small';
    });
    pendingSettingsPuts[0].respond(false);
    expect((await firstSave).ok).toBe(false);
    const retry = useSettingsStore.getState().saveDraft();
    await vi.waitFor(() => expect(pendingSettingsPuts).toHaveLength(2));
    pendingSettingsPuts[1].respond();
    expect((await retry).ok).toBe(true);
    expect(useSettingsStore.getState().persistedSettings.general.fontSize).toBe('small');
  });

  it('saves apiKey to backend without persisting it to localStorage', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.session.ai.apiKey = 'sk-test';
    });
    await useSettingsStore.getState().saveDraft();

    const raw = window.localStorage.getItem('feedfuse-settings:anonymous');
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

  it('persists rss maxStoredArticlesPerFeed through settingsStore saveDraft', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      (
        draft.persisted.rss as typeof draft.persisted.rss & {
          maxStoredArticlesPerFeed?: number;
        }
      ).maxStoredArticlesPerFeed = 1000;
    });

    await useSettingsStore.getState().saveDraft();

    expect(lastSettingsPutBodyText).toContain('"maxStoredArticlesPerFeed":1000');
  });

  it('persists ai deepThinkingEnabled through settingsStore saveDraft', async () => {
    useSettingsStore.getState().loadDraft();
    useSettingsStore.getState().updateDraft((draft) => {
      draft.persisted.ai.deepThinkingEnabled = true;
    });

    await useSettingsStore.getState().saveDraft();

    expect(lastSettingsPutBodyText).toContain('"deepThinkingEnabled":true');
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

    window.localStorage.setItem('feedfuse-settings:anonymous', JSON.stringify(legacy));
    await useSettingsStore.persist.rehydrate();

    expect(useSettingsStore.getState().persistedSettings.general.theme).toBe('dark');
  });
});
