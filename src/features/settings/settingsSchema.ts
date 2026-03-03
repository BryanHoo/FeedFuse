import type {
  AIPersistedSettings,
  Category,
  GeneralSettings,
  PersistedSettings,
  RssSettings,
  RssSourceSetting,
} from '../../types';

const defaultGeneralSettings: GeneralSettings = {
  theme: 'auto',
  fontSize: 'medium',
  fontFamily: 'sans',
  lineHeight: 'normal',
  autoMarkReadEnabled: true,
  autoMarkReadDelayMs: 2000,
  defaultUnreadOnlyInAll: false,
  sidebarCollapsed: false,
};

const defaultAISettings: AIPersistedSettings = {
  summaryEnabled: false,
  translateEnabled: false,
  autoSummarize: false,
  model: '',
  apiBaseUrl: '',
  translation: {
    useSharedAi: true,
    model: '',
    apiBaseUrl: '',
  },
};

const defaultRssSettings: RssSettings = {
  sources: [],
  fetchIntervalMinutes: 30,
};

export const defaultPersistedSettings: PersistedSettings = {
  general: defaultGeneralSettings,
  ai: defaultAISettings,
  categories: [],
  rss: defaultRssSettings,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function readNumberEnum<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'number' && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeGeneralSettings(input: Record<string, unknown>): GeneralSettings {
  const generalInput = isRecord(input.general) ? input.general : isRecord(input.appearance) ? input.appearance : input;

  return {
    theme: readEnum(generalInput.theme, ['light', 'dark', 'auto'], defaultGeneralSettings.theme),
    fontSize: readEnum(generalInput.fontSize, ['small', 'medium', 'large'], defaultGeneralSettings.fontSize),
    fontFamily: readEnum(generalInput.fontFamily, ['sans', 'serif'], defaultGeneralSettings.fontFamily),
    lineHeight: readEnum(
      generalInput.lineHeight,
      ['compact', 'normal', 'relaxed'],
      defaultGeneralSettings.lineHeight
    ),
    autoMarkReadEnabled: readBoolean(generalInput.autoMarkReadEnabled, defaultGeneralSettings.autoMarkReadEnabled),
    autoMarkReadDelayMs: readNumberEnum(
      generalInput.autoMarkReadDelayMs,
      [0, 2000, 5000] as const,
      defaultGeneralSettings.autoMarkReadDelayMs
    ),
    defaultUnreadOnlyInAll: readBoolean(generalInput.defaultUnreadOnlyInAll, defaultGeneralSettings.defaultUnreadOnlyInAll),
    sidebarCollapsed: readBoolean(generalInput.sidebarCollapsed, defaultGeneralSettings.sidebarCollapsed),
  };
}

function normalizeAISettings(input: Record<string, unknown>): AIPersistedSettings {
  const aiInput = isRecord(input.ai) ? input.ai : {};
  const translationInput = isRecord(aiInput.translation) ? aiInput.translation : {};

  return {
    summaryEnabled: readBoolean(aiInput.summaryEnabled, defaultAISettings.summaryEnabled),
    translateEnabled: readBoolean(aiInput.translateEnabled, defaultAISettings.translateEnabled),
    autoSummarize: readBoolean(aiInput.autoSummarize, defaultAISettings.autoSummarize),
    model: readString(aiInput.model, defaultAISettings.model),
    apiBaseUrl: readString(aiInput.apiBaseUrl, defaultAISettings.apiBaseUrl),
    translation: {
      useSharedAi: readBoolean(
        translationInput.useSharedAi,
        defaultAISettings.translation.useSharedAi,
      ),
      model: readString(translationInput.model, defaultAISettings.translation.model),
      apiBaseUrl: readString(
        translationInput.apiBaseUrl,
        defaultAISettings.translation.apiBaseUrl,
      ),
    },
  };
}

function normalizeRssSource(source: unknown, index: number): RssSourceSetting {
  if (!isRecord(source)) {
    return {
      id: `source-${index}`,
      name: '',
      url: '',
      category: null,
      enabled: true,
    };
  }

  const legacyFolder = typeof source.folder === 'string' ? source.folder : null;
  const category = typeof source.category === 'string' ? source.category : legacyFolder;

  return {
    id: readString(source.id, `source-${index}`),
    name: readString(source.name, ''),
    url: readString(source.url, ''),
    category,
    enabled: readBoolean(source.enabled, true),
  };
}

function normalizeRssSettings(input: Record<string, unknown>): RssSettings {
  const rssInput = isRecord(input.rss) ? input.rss : {};
  const sources = Array.isArray(rssInput.sources)
    ? rssInput.sources.map((source, index) => normalizeRssSource(source, index))
    : [];

  const fetchIntervalMinutes = readNumberEnum(
    rssInput.fetchIntervalMinutes,
    [5, 15, 30, 60, 120] as const,
    defaultRssSettings.fetchIntervalMinutes
  );

  return { sources, fetchIntervalMinutes };
}

function normalizeCategories(input: Record<string, unknown>, rss: RssSettings): Category[] {
  const result: Category[] = [];
  const seen = new Set<string>();

  const pushCategory = (name: string, id?: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    const key = trimmedName.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const trimmedId = id?.trim();
    result.push({
      id: trimmedId ? trimmedId : `cat-${result.length}`,
      name: trimmedName,
    });
  };

  const rawCategories = Array.isArray(input.categories) ? input.categories : [];

  rawCategories.forEach((item) => {
    if (!isRecord(item)) {
      return;
    }

    pushCategory(readString(item.name, ''), readString(item.id, ''));
  });

  rss.sources.forEach((source) => {
    if (!source.category) {
      return;
    }
    pushCategory(source.category);
  });

  return result;
}

export function normalizePersistedSettings(input: unknown): PersistedSettings {
  const recordInput = isRecord(input) ? input : {};
  const normalizedRss = normalizeRssSettings(recordInput);

  return {
    general: normalizeGeneralSettings(recordInput),
    ai: normalizeAISettings(recordInput),
    categories: normalizeCategories(recordInput, normalizedRss),
    rss: normalizedRss,
  };
}
