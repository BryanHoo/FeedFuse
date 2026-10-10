import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { normalizePersistedSettings, defaultPersistedSettings } from '../features/settings/settingsSchema';
import { validateSettingsDraft } from '../features/settings/utils/validateSettingsDraft';
import type { GeneralSettings, PersistedSettings, UserSettings } from '../types';
import {
  ApiError,
  putSettingsDraft,
  getAiApiKeyStatus,
  getSettings,
  getTranslationApiKeyStatus,
} from '@/lib/api/apiClient';
import { AUTH_ANONYMOUS_STORAGE_USER_ID, getCurrentStorageUserId } from './authStore';

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
  failure?: {
    kind: 'validation' | 'network' | 'server' | 'authentication';
    message: string;
    outcome: 'unchanged' | 'unknown';
  };
}

interface SettingsState {
  persistedSettings: PersistedSettings;
  sessionSettings: SessionSettings;
  draft: SettingsDraft | null;
  draftVersion: number;
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
    summaryPrompt?: string;
    translationPrompt?: string;
    deepThinkingEnabled?: boolean;
    translation?: {
      useSharedAi?: boolean;
      model?: string;
      apiBaseUrl?: string;
    };
  };

  ai.summaryPrompt = ai.summaryPrompt ?? '';
  ai.translationPrompt = ai.translationPrompt ?? '';
  ai.deepThinkingEnabled = ai.deepThinkingEnabled ?? false;

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

function resolveSettingsStorageName(): string {
  return `feedfuse-settings:${getCurrentStorageUserId()}`;
}

function readSettingsStorageValue(): string | null {
  const userId = getCurrentStorageUserId();
  const scopedValue = window.localStorage.getItem(resolveSettingsStorageName());
  if (scopedValue !== null) {
    return scopedValue;
  }

  // 默认管理员继承旧单用户缓存；其他用户必须使用自己的命名空间。
  if (userId === AUTH_ANONYMOUS_STORAGE_USER_ID || userId === '1') {
    return window.localStorage.getItem('feedfuse-settings');
  }

  return null;
}

// 保存队列覆盖设置和密钥请求的完整流程，避免后发请求先写入服务端。
let draftSaveQueue: Promise<void> = Promise.resolve();
// 关闭或重新加载草稿后递增，防止旧任务保存或覆盖另一次编辑会话。
let draftGeneration = 0;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      persistedSettings: cloneDeep(defaultPersistedSettings),
      sessionSettings: cloneDeep(defaultSessionSettings),
      draft: null,
      draftVersion: 0,
      validationErrors: {},
      settings: pickUserSettings(defaultPersistedSettings),
      hydratePersistedSettings: async () => {
        if (typeof window === 'undefined') {
          return;
        }

        // 密钥状态仅供设置页展示，不应阻塞阅读器首屏快照。
        void Promise.allSettled([
          getAiApiKeyStatus({ notifyOnError: false }),
          getTranslationApiKeyStatus({ notifyOnError: false }),
        ]).then(([apiKeyStatusResult, translationApiKeyStatusResult]) => {
          const hasApiKey =
            apiKeyStatusResult.status === 'fulfilled' &&
            typeof apiKeyStatusResult.value.hasApiKey === 'boolean'
              ? apiKeyStatusResult.value.hasApiKey
              : null;
          const hasTranslationApiKey =
            translationApiKeyStatusResult.status === 'fulfilled' &&
            typeof translationApiKeyStatusResult.value.hasApiKey === 'boolean'
              ? translationApiKeyStatusResult.value.hasApiKey
              : null;

          if (hasApiKey === null && hasTranslationApiKey === null) {
            return;
          }

          set((state) => ({
            sessionSettings: {
              ...state.sessionSettings,
              ai: {
                ...state.sessionSettings.ai,
                ...(hasApiKey === null ? {} : { hasApiKey }),
                ...(hasTranslationApiKey === null ? {} : { hasTranslationApiKey }),
              },
            },
          }));
        });

        try {
          const remoteSettings = await getSettings({ notifyOnError: false });

          set({
            persistedSettings: ensureAiTranslationSettings(remoteSettings),
            settings: pickUserSettings(remoteSettings),
          });
        } catch (err) {
          console.error(err);
        }
      },
      loadDraft: () => {
        draftGeneration += 1;
        set((state) => ({
          draft: createDraft(state.persistedSettings, state.sessionSettings),
          draftVersion: state.draftVersion + 1,
          validationErrors: {},
        }));
      },
      updateDraft: (updater) =>
        set((state) => {
          const baseDraft = state.draft ?? createDraft(state.persistedSettings, state.sessionSettings);
          const nextDraft = cloneDeep(baseDraft);
          updater(nextDraft);

          return {
            draft: nextDraft,
            draftVersion: state.draftVersion + 1,
            validationErrors: {},
          };
        }),
      saveDraft: () => {
        const generation = draftGeneration;
        const saving = draftSaveQueue.then(async (): Promise<SaveDraftResult> => {
          // 在轮到当前任务时取快照，排队期间的新编辑也能进入下一次请求。
          const state = get();
          if (!state.draft || generation !== draftGeneration) {
            return { ok: true };
          }

          const submittedDraft = state.draft;
          const validation = validateSettingsDraft(submittedDraft);
          if (!validation.valid) {
            set({ validationErrors: validation.errors });
            return {
              ok: false,
              failure: { kind: 'validation', message: '请修正标出的字段，修改后会自动保存。', outcome: 'unchanged' },
            };
          }

          const nextPersistedSettings = ensureAiTranslationSettings(submittedDraft.persisted);

          try {
            const submittedAi = submittedDraft.session.ai;
            const apiKey = submittedAi.apiKey.trim();
            const translationApiKey = (submittedAi.translationApiKey ?? '').trim();
            const clearDraftApiKey = submittedAi.clearApiKey || Boolean(apiKey);
            const clearDraftTranslationApiKey = !nextPersistedSettings.ai.translation.useSharedAi &&
              (Boolean(submittedAi.clearTranslationApiKey) || Boolean(translationApiKey));
            // 省略未编辑的密钥，删除用 null；全部修改通过同一个事务接口提交。
            const result = await putSettingsDraft({
              settings: nextPersistedSettings,
              secrets: {
                ...(clearDraftApiKey ? { aiApiKey: submittedAi.clearApiKey ? null : apiKey } : {}),
                ...(clearDraftTranslationApiKey ? {
                  translationApiKey: submittedAi.clearTranslationApiKey ? null : translationApiKey,
                } : {}),
              },
            }, { notifyOnError: false, redirectOnUnauthorized: false });
            const { settings: savedSettings, hasApiKey, hasTranslationApiKey } = result;

            const nextSessionSettings: SessionSettings = {
              ai: {
                apiKey: clearDraftApiKey ? '' : submittedDraft.session.ai.apiKey,
                hasApiKey,
                clearApiKey: false,
                translationApiKey: clearDraftTranslationApiKey
                  ? ''
                  : (submittedDraft.session.ai.translationApiKey ?? ''),
                hasTranslationApiKey,
                clearTranslationApiKey: false,
              },
              rssValidation: {},
            };

            set((current) => {
              let nextDraft = current.draft;
              const sameGeneration = generation === draftGeneration;
              const sameVersion = state.draftVersion === current.draftVersion;

              if (sameGeneration && nextDraft) {
                if (sameVersion) {
                  nextDraft = createDraft(savedSettings, nextSessionSettings);
                } else {
                  // 旧响应只确认已提交内容；保留请求期间的新设置、密钥和 RSS 校验状态。
                  nextDraft = cloneDeep(nextDraft);
                  const currentAi = nextDraft.session.ai;
                  const submittedAi = submittedDraft.session.ai;
                  currentAi.hasApiKey = hasApiKey;
                  currentAi.hasTranslationApiKey = hasTranslationApiKey;

                  // 仅消费与请求快照一致的密钥操作，不能清空用户后来输入的值或删除意图。
                  if (clearDraftApiKey && currentAi.apiKey === submittedAi.apiKey &&
                      currentAi.clearApiKey === submittedAi.clearApiKey) {
                    currentAi.apiKey = '';
                    currentAi.clearApiKey = false;
                  }
                  if (clearDraftTranslationApiKey &&
                      currentAi.translationApiKey === submittedAi.translationApiKey &&
                      currentAi.clearTranslationApiKey === submittedAi.clearTranslationApiKey) {
                    currentAi.translationApiKey = '';
                    currentAi.clearTranslationApiKey = false;
                  }
                }
              }

              return {
                persistedSettings: cloneDeep(savedSettings),
                sessionSettings: nextSessionSettings,
                draft: nextDraft,
                // 新草稿的校验结果不能由旧请求清空。
                validationErrors: sameGeneration && sameVersion ? {} : current.validationErrors,
                settings: pickUserSettings(savedSettings),
              };
            });

            return { ok: true };
          } catch (err) {
            console.error(err);
            const apiError = err instanceof ApiError ? err : null;
            const isValidation = apiError?.code === 'validation_error';
            // 仅给仍对应本次请求的草稿标错，旧失败不能污染后来输入的内容。
            if (isValidation && apiError?.fields && generation === draftGeneration &&
                state.draftVersion === get().draftVersion) {
              const fields: Record<string, string> = {};
              for (const field of Object.keys(apiError.fields)) {
                const key = field === 'secrets.aiApiKey' ? 'ai.apiKey'
                  : field === 'secrets.translationApiKey' ? 'ai.translation.apiKey' : field;
                fields[key] = '填写内容无效，请检查该字段的格式和允许值后修改。';
              }
              set({ validationErrors: fields });
            }
            const networkFailure = apiError?.code === 'network_error' || apiError?.code === 'timeout';
            const authenticationFailure = apiError?.status === 401 || apiError?.status === 403;
            // 连接中断或响应无法解析时，服务端可能已提交，不能声称“未保存”。重试完整替换即可恢复。
            const unknownOutcome = networkFailure || !apiError || apiError.code === 'invalid_response';
            return {
              ok: false,
              err,
              shouldNotify: true,
              failure: {
                kind: isValidation ? 'validation' : networkFailure ? 'network'
                  : authenticationFailure ? 'authentication' : 'server',
                message: isValidation ? '设置内容未通过校验，请检查标出的字段后修改。'
                  : authenticationFailure ? '登录已失效或没有保存权限，请重新登录后重试保存。'
                  : networkFailure ? (apiError?.code === 'timeout'
                    ? '保存请求超时，请检查网络连接后点击“重试保存”。'
                    : '网络连接失败，请检查网络连接后点击“重试保存”。')
                  : '服务暂时无法保存设置，请稍后点击“重试保存”。',
                outcome: unknownOutcome ? 'unknown' : 'unchanged',
              },
            };
          }
        });
        // 无论本次成功还是失败，后续保存都可以继续执行。
        draftSaveQueue = saving.then(() => undefined, () => undefined);
        return saving;
      },
      discardDraft: () => {
        draftGeneration += 1;
        set((state) => ({
          draft: null,
          draftVersion: state.draftVersion + 1,
          validationErrors: {},
        }));
      },
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

        return {
          getItem: () => readSettingsStorageValue(),
          setItem: (_name, value) => {
            window.localStorage.setItem(resolveSettingsStorageName(), value);
          },
          removeItem: () => {
            window.localStorage.removeItem(resolveSettingsStorageName());
          },
        };
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
