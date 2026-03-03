import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizePersistedSettings, defaultPersistedSettings } from '../features/settings/settingsSchema';
import { validateSettingsDraft } from '../features/settings/validateSettingsDraft';
import type { PersistedSettings, UserSettings } from '../types';
import { deleteAiApiKey, getAiApiKeyStatus, getSettings, putAiApiKey, putSettings } from '../lib/apiClient';

interface SessionSettings {
  ai: {
    apiKey: string;
    hasApiKey: boolean;
    clearApiKey: boolean;
  };
  rssValidation: Record<
    string,
    {
      status: 'idle' | 'validating' | 'verified' | 'failed';
      verifiedUrl: string | null;
    }
  >;
}

export interface SettingsDraft {
  persisted: PersistedSettings;
  session: SessionSettings;
}

interface SettingsState {
  persistedSettings: PersistedSettings;
  sessionSettings: SessionSettings;
  draft: SettingsDraft | null;
  validationErrors: Record<string, string>;
  hydratePersistedSettings: () => Promise<void>;
  loadDraft: () => void;
  updateDraft: (updater: (draft: SettingsDraft) => void) => void;
  saveDraft: () => Promise<{ ok: boolean }>;
  discardDraft: () => void;

  // Compatibility layer for legacy consumers during migration.
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
}

const defaultSessionSettings: SessionSettings = {
  ai: {
    apiKey: '',
    hasApiKey: false,
    clearApiKey: false,
  },
  rssValidation: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cloneDeep<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function createDraft(persistedSettings: PersistedSettings, sessionSettings: SessionSettings): SettingsDraft {
  const persistedWithTranslation = ensureAiTranslationSettings(persistedSettings);
  return {
    persisted: persistedWithTranslation,
    session: cloneDeep(sessionSettings),
  };
}

function pickUserSettings(persistedSettings: PersistedSettings): UserSettings {
  return {
    theme: persistedSettings.general.theme,
    fontSize: persistedSettings.general.fontSize,
    fontFamily: persistedSettings.general.fontFamily,
    lineHeight: persistedSettings.general.lineHeight,
  };
}

function extractNormalizeInput(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  if (isRecord(input.persistedSettings)) {
    return input.persistedSettings;
  }

  if (isRecord(input.settings)) {
    return input.settings;
  }

  return input;
}

function ensureAiTranslationSettings(persistedSettings: PersistedSettings): PersistedSettings {
  const next = cloneDeep(persistedSettings);
  const ai = next.ai as typeof next.ai & {
    translation?: {
      useSharedAi?: boolean;
      model?: string;
      apiBaseUrl?: string;
    };
  };

  ai.translation = {
    useSharedAi: ai.translation?.useSharedAi ?? true,
    model: ai.translation?.model ?? '',
    apiBaseUrl: ai.translation?.apiBaseUrl ?? '',
  };

  return next;
}

const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      persistedSettings: cloneDeep(defaultPersistedSettings),
      sessionSettings: cloneDeep(defaultSessionSettings),
      draft: null,
      validationErrors: {},
      settings: pickUserSettings(defaultPersistedSettings),
      hydratePersistedSettings: async () => {
        if (typeof window === 'undefined') {
          return;
        }

        try {
          const [remoteSettingsResult, apiKeyStatusResult] = await Promise.allSettled([
            getSettings(),
            getAiApiKeyStatus(),
          ]);

          const remoteSettings =
            remoteSettingsResult.status === 'fulfilled' ? remoteSettingsResult.value : null;
          const hasApiKey =
            apiKeyStatusResult.status === 'fulfilled' ? apiKeyStatusResult.value.hasApiKey : null;

          if (!remoteSettings && hasApiKey === null) {
            return;
          }

          set((state) => ({
            ...(remoteSettings
              ? {
                  persistedSettings: ensureAiTranslationSettings(remoteSettings),
                  settings: pickUserSettings(remoteSettings),
                }
              : {}),
            ...(hasApiKey === null
              ? {}
              : {
                  sessionSettings: {
                    ...state.sessionSettings,
                    ai: {
                      ...state.sessionSettings.ai,
                      hasApiKey,
                    },
                  },
                }),
          }));
        } catch (err) {
          console.error(err);
        }
      },
      loadDraft: () =>
        set((state) => ({
          draft: createDraft(state.persistedSettings, state.sessionSettings),
          validationErrors: {},
        })),
      updateDraft: (updater) =>
        set((state) => {
          const baseDraft = state.draft ?? createDraft(state.persistedSettings, state.sessionSettings);
          const nextDraft = cloneDeep(baseDraft);
          updater(nextDraft);

          return {
            draft: nextDraft,
            validationErrors: {},
          };
        }),
      saveDraft: async () => {
        const state = get();
        if (!state.draft) {
          return { ok: true };
        }

        const validation = validateSettingsDraft(state.draft);
        if (!validation.valid) {
          set({ validationErrors: validation.errors });
          return { ok: false };
        }

        const nextPersistedSettings = ensureAiTranslationSettings(state.draft.persisted);

        try {
          const savedSettings = await putSettings(nextPersistedSettings);
          const shouldClearApiKey = state.draft.session.ai.clearApiKey;
          const apiKey = state.draft.session.ai.apiKey.trim();

          let hasApiKey = state.draft.session.ai.hasApiKey;
          let clearDraftApiKey = false;

          if (shouldClearApiKey) {
            const result = await deleteAiApiKey();
            hasApiKey = result.hasApiKey;
            clearDraftApiKey = true;
          } else if (apiKey) {
            const result = await putAiApiKey({ apiKey });
            hasApiKey = result.hasApiKey;
            clearDraftApiKey = true;
          }

          const nextSessionSettings: SessionSettings = {
            ai: {
              apiKey: clearDraftApiKey ? '' : state.draft.session.ai.apiKey,
              hasApiKey,
              clearApiKey: false,
            },
            rssValidation: {},
          };

          set({
            persistedSettings: cloneDeep(savedSettings),
            sessionSettings: nextSessionSettings,
            draft: createDraft(savedSettings, nextSessionSettings),
            validationErrors: {},
            settings: pickUserSettings(savedSettings),
          });

          return { ok: true };
        } catch (err) {
          console.error(err);
          return { ok: false };
        }
      },
      discardDraft: () =>
        set({
          draft: null,
          validationErrors: {},
        }),
      updateSettings: (partial) =>
        set((state) => ({
          persistedSettings: {
            ...state.persistedSettings,
            general: { ...state.persistedSettings.general, ...partial },
          },
          settings: { ...state.settings, ...partial },
        })),
    }),
    {
      name: 'feedfuse-settings',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return noopStorage;
        }

        return window.localStorage;
      }),
      partialize: (state) => ({ persistedSettings: state.persistedSettings }),
      version: 3,
      migrate: (persistedState) => ({
        persistedSettings: normalizePersistedSettings(extractNormalizeInput(persistedState)),
      }),
      merge: (persistedState, currentState) => {
        const persistedInput = extractNormalizeInput(persistedState);
        const normalized = normalizePersistedSettings(persistedInput);
        const merged = {
          ...currentState,
          ...(isRecord(persistedState) ? persistedState : {}),
          persistedSettings: normalized,
          settings: pickUserSettings(normalized),
        };

        return merged as SettingsState;
      },
    }
  )
);
