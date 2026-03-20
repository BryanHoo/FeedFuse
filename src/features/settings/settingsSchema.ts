import type {
  AIPersistedSettings,
  Category,
  GeneralSettings,
  LoggingSettings,
  PersistedSettings,
  RssSettings,
  RssSourceSetting,
} from '../../types';
import {
  normalizeReaderPaneWidth,
  READER_LEFT_PANE_DEFAULT_WIDTH,
  READER_LEFT_PANE_MAX_WIDTH,
  READER_LEFT_PANE_MIN_WIDTH,
  READER_MIDDLE_PANE_DEFAULT_WIDTH,
  READER_MIDDLE_PANE_MAX_WIDTH,
  READER_MIDDLE_PANE_MIN_WIDTH,
} from '../reader/readerLayoutSizing';

const defaultGeneralSettings: GeneralSettings = {
  theme: 'auto',
  fontSize: 'medium',
  fontFamily: 'sans',
  lineHeight: 'normal',
  autoMarkReadEnabled: true,
  autoMarkReadDelayMs: 2000,
  defaultUnreadOnlyInAll: false,
  sidebarCollapsed: false,
  leftPaneWidth: READER_LEFT_PANE_DEFAULT_WIDTH,
  middlePaneWidth: READER_MIDDLE_PANE_DEFAULT_WIDTH,
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
  articleFilter: {
    keyword: {
      enabled: false,
      keywords: [],
    },
    ai: {
      enabled: false,
      prompt: '',
    },
  },
};

const defaultLoggingSettings: LoggingSettings = {
  enabled: false,
  retentionDays: 7,
  minLevel: 'info',
};

export const defaultPersistedSettings: PersistedSettings = {
  general: defaultGeneralSettings,
  ai: defaultAISettings,
  categories: [],
  rss: defaultRssSettings,
  logging: defaultLoggingSettings,
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
    leftPaneWidth: normalizeReaderPaneWidth(
      generalInput.leftPaneWidth,
      defaultGeneralSettings.leftPaneWidth,
      READER_LEFT_PANE_MIN_WIDTH,
      READER_LEFT_PANE_MAX_WIDTH,
    ),
    middlePaneWidth: normalizeReaderPaneWidth(
      generalInput.middlePaneWidth,
      defaultGeneralSettings.middlePaneWidth,
      READER_MIDDLE_PANE_MIN_WIDTH,
      READER_MIDDLE_PANE_MAX_WIDTH,
    ),
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

function normalizeKeywordList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (typeof item !== 'string') {
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }

    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function normalizeArticleFilter(input: Record<string, unknown>): RssSettings['articleFilter'] {
  const legacyKeywordFilterInput = isRecord(input.articleKeywordFilter) ? input.articleKeywordFilter : {};
  const articleFilterInput = isRecord(input.articleFilter) ? input.articleFilter : {};
  const keywordInput = isRecord(articleFilterInput.keyword) ? articleFilterInput.keyword : {};
  const aiInput = isRecord(articleFilterInput.ai) ? articleFilterInput.ai : {};
  const migratedKeywords = normalizeKeywordList(legacyKeywordFilterInput.globalKeywords);
  const normalizedKeywords = normalizeKeywordList(
    Array.isArray(keywordInput.keywords)
      ? keywordInput.keywords
      : migratedKeywords,
  );

  return {
    keyword: {
      enabled: readBoolean(
        keywordInput.enabled,
        normalizedKeywords.length > 0,
      ),
      keywords: normalizedKeywords,
    },
    ai: {
      enabled: readBoolean(aiInput.enabled, defaultRssSettings.articleFilter.ai.enabled),
      prompt: readString(aiInput.prompt, defaultRssSettings.articleFilter.ai.prompt).trim(),
    },
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

  return {
    sources,
    fetchIntervalMinutes,
    articleFilter: normalizeArticleFilter(rssInput),
  };
}

function normalizeLoggingSettings(input: Record<string, unknown>): LoggingSettings {
  const loggingInput = isRecord(input.logging) ? input.logging : {};

  return {
    enabled: readBoolean(loggingInput.enabled, defaultLoggingSettings.enabled),
    retentionDays: readNumberEnum(
      loggingInput.retentionDays,
      [1, 3, 7, 14, 30, 90] as const,
      defaultLoggingSettings.retentionDays,
    ),
    minLevel: readEnum(
      loggingInput.minLevel,
      ['info', 'warning', 'error'] as const,
      defaultLoggingSettings.minLevel,
    ),
  };
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
    logging: normalizeLoggingSettings(recordInput),
  };
}
