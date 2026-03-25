import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizePersistedSettings, defaultPersistedSettings } from '../features/settings/settingsSchema';
import { validateSettingsDraft } from '../features/settings/validateSettingsDraft';
import type { GeneralSettings, PersistedSettings, UserSettings } from '../types';
import {
  deleteAiApiKey,
  deleteTranslationApiKey,
  getAiApiKeyStatus,
  getSettings,
  getTranslationApiKeyStatus,
  putAiApiKey,
  putSettings,
  putTranslationApiKey,
} from '../lib/apiClient';

interface SessionSettings {
  ai: {
    apiKey: string;
    hasApiKey: boolean;
    clearApiKey: boolean;
    translationApiKey?: string;
    hasTranslationApiKey?: boolean;
    clearTranslationApiKey?: boolean;
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

export interface SaveDraftResult {
  ok: boolean;
  err?: unknown;
  shouldNotify?: boolean;
}

interface SettingsState {
  persistedSettings: PersistedSettings;
  sessionSettings: SessionSettings;
  draft: SettingsDraft | null;
  validationErrors: Record<string, string>;
  hydratePersistedSettings: () => Promise<void>;
  loadDraft: () => void;
  updateDraft: (updater: (draft: SettingsDraft) => void) => void;
  saveDraft: () => Promise<SaveDraftResult>;
  discardDraft: () => void;

  // Compatibility layer for legacy consumers during migration.
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  updateReaderLayoutSettings: (
    partial: Partial<Pick<GeneralSettings, 'leftPaneWidth' | 'middlePaneWidth'>>,
  ) => void;
}

const defaultSessionSettings: SessionSettings = {
  ai: {
    apiKey: '',
    hasApiKey: false,
    clearApiKey: false,
    translationApiKey: '',
    hasTranslationApiKey: false,
    clearTranslationApiKey: false,
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
          const [remoteSettingsResult, apiKeyStatusResult, translationApiKeyStatusResult] = await Promise.allSettled([
            getSettings({ notifyOnError: false }),
            getAiApiKeyStatus({ notifyOnError: false }),
            getTranslationApiKeyStatus({ notifyOnError: false }),
          ]);

          const remoteSettings =
            remoteSettingsResult.status === 'fulfilled' ? remoteSettingsResult.value : null;
          const hasApiKey =
            apiKeyStatusResult.status === 'fulfilled' && typeof apiKeyStatusResult.value.hasApiKey === 'boolean'
              ? apiKeyStatusResult.value.hasApiKey
              : null;
          const hasTranslationApiKey =
            translationApiKeyStatusResult.status === 'fulfilled' &&
            typeof translationApiKeyStatusResult.value.hasApiKey === 'boolean'
              ? translationApiKeyStatusResult.value.hasApiKey
              : null;

          if (!remoteSettings && hasApiKey === null && hasTranslationApiKey === null) {
            return;
          }

          set((state) => ({
            ...(remoteSettings
              ? {
                  persistedSettings: ensureAiTranslationSettings(remoteSettings),
                  settings: pickUserSettings(remoteSettings),
                }
              : {}),
            ...(hasApiKey === null && hasTranslationApiKey === null
              ? {}
              : {
                  sessionSettings: {
                    ...state.sessionSettings,
                    ai: {
                      ...state.sessionSettings.ai,
                      ...(hasApiKey === null ? {} : { hasApiKey }),
                      ...(hasTranslationApiKey === null
                        ? {}
                        : { hasTranslationApiKey }),
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
        let settingsSaved = false;

        try {
          const savedSettings = await putSettings(nextPersistedSettings, {
            notifyOnError: false,
          });
          settingsSaved = true;
          const shouldClearApiKey = state.draft.session.ai.clearApiKey;
          const apiKey = state.draft.session.ai.apiKey.trim();
          const shouldClearTranslationApiKey = state.draft.session.ai.clearTranslationApiKey ?? false;
          const translationApiKey = (state.draft.session.ai.translationApiKey ?? '').trim();

          let hasApiKey = state.draft.session.ai.hasApiKey;
          let hasTranslationApiKey = state.draft.session.ai.hasTranslationApiKey ?? false;
          let clearDraftApiKey = false;
          let clearDraftTranslationApiKey = false;

          if (shouldClearApiKey) {
            const result = await deleteAiApiKey();
            hasApiKey = result.hasApiKey;
            clearDraftApiKey = true;
          } else if (apiKey) {
            const result = await putAiApiKey({ apiKey });
            hasApiKey = result.hasApiKey;
            clearDraftApiKey = true;
          }

          if (!nextPersistedSettings.ai.translation.useSharedAi) {
            if (shouldClearTranslationApiKey) {
              const result = await deleteTranslationApiKey();
              hasTranslationApiKey = result.hasApiKey;
              clearDraftTranslationApiKey = true;
            } else if (translationApiKey) {
              const result = await putTranslationApiKey({ apiKey: translationApiKey });
              hasTranslationApiKey = result.hasApiKey;
              clearDraftTranslationApiKey = true;
            }
          }

          const nextSessionSettings: SessionSettings = {
            ai: {
              apiKey: clearDraftApiKey ? '' : state.draft.session.ai.apiKey,
              hasApiKey,
              clearApiKey: false,
              translationApiKey: clearDraftTranslationApiKey
                ? ''
                : (state.draft.session.ai.translationApiKey ?? ''),
              hasTranslationApiKey,
              clearTranslationApiKey: false,
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
          return {
            ok: false,
            err,
            shouldNotify: !settingsSaved,
          };
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
      updateReaderLayoutSettings: (partial) =>
        set((state) => ({
          persistedSettings: {
            ...state.persistedSettings,
            general: {
              ...state.persistedSettings.general,
              ...partial,
            },
          },
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
