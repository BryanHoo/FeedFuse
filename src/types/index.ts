export type FeedKind = 'rss' | 'ai_digest';

export interface Feed {
  id: string;
  kind: FeedKind;
  title: string;
  url: string;
  siteUrl?: string | null;
  icon?: string;
  unreadCount: number;
  enabled: boolean;
  fullTextOnOpenEnabled: boolean;
  fullTextOnFetchEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
  articleListDisplayMode: 'card' | 'list';
  categoryId?: string | null;
  category?: string | null;
  fetchStatus: number | null;
  fetchError: string | null;
  fetchRawError?: string | null;
}

export interface Category {
  id: string;
  name: string;
  expanded?: boolean;
}

export type Folder = Category;

export interface Article {
  id: string;
  feedId: string;
  title: string;
  titleOriginal?: string;
  titleZh?: string;
  content: string;
  aiSummary?: string;
  aiSummarySession?: ArticleAiSummarySession | null;
  aiTranslationZhHtml?: string;
  aiTranslationBilingualHtml?: string;
  previewImage?: string;
  summary: string;
  author?: string;
  publishedAt: string;
  link: string;
  filterStatus?: 'pending' | 'passed' | 'filtered' | 'error';
  isFiltered?: boolean;
  filteredBy?: string[];
  isRead: boolean;
  isStarred: boolean;
  bodyTranslationEligible?: boolean;
  bodyTranslationBlockedReason?: string | null;
  aiDigestSources?: ArticleAiDigestSource[];
}

export interface ArticleAiDigestSource {
  articleId: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link?: string | null;
  publishedAt?: string | null;
  position: number;
}

export interface ArticleAiSummarySession {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  draftText: string;
  finalText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rawErrorMessage?: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'sans' | 'serif';
  lineHeight: 'compact' | 'normal' | 'relaxed';
}

export interface GeneralSettings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'sans' | 'serif';
  lineHeight: 'compact' | 'normal' | 'relaxed';
  autoMarkReadEnabled: boolean;
  autoMarkReadDelayMs: 0 | 2000 | 5000;
  defaultUnreadOnlyInAll: boolean;
  sidebarCollapsed: boolean;
  leftPaneWidth: number;
  middlePaneWidth: number;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'auto';
  fontSize: 'small' | 'medium' | 'large';
  fontFamily: 'sans' | 'serif';
  lineHeight: 'compact' | 'normal' | 'relaxed';
}

export interface AIPersistedSettings {
  summaryEnabled: boolean;
  translateEnabled: boolean;
  autoSummarize: boolean;
  model: string;
  apiBaseUrl: string;
  translation: {
    useSharedAi: boolean;
    model: string;
    apiBaseUrl: string;
  };
}

export interface RssSourceSetting {
  id: string;
  name: string;
  url: string;
  category: string | null;
  enabled: boolean;
}

export interface ArticleFilterKeywordSettings {
  enabled: boolean;
  keywords: string[];
}

export interface ArticleFilterAiSettings {
  enabled: boolean;
  prompt: string;
}

export interface ArticleFilterSettings {
  keyword: ArticleFilterKeywordSettings;
  ai: ArticleFilterAiSettings;
}

export type RssMaxStoredArticlesPerFeed = 100 | 200 | 500 | 1000 | 2000;

export interface RssSettings {
  sources: RssSourceSetting[];
  fetchIntervalMinutes: 5 | 15 | 30 | 60 | 120;
  maxStoredArticlesPerFeed: RssMaxStoredArticlesPerFeed;
  articleFilter: ArticleFilterSettings;
}

export type LoggingRetentionDays = 1 | 3 | 7 | 14 | 30 | 90;
export type SystemLogLevel = 'error' | 'warning' | 'info';
export type SystemLogCategory =
  | 'feed'
  | 'category'
  | 'article'
  | 'opml'
  | 'settings'
  | 'external_api'
  | 'ai_summary'
  | 'ai_translate'
  | 'ai_digest';

export interface LoggingSettings {
  enabled: boolean;
  retentionDays: LoggingRetentionDays;
  minLevel: SystemLogLevel;
}

export interface SystemLogItem {
  id: string;
  level: SystemLogLevel;
  category: SystemLogCategory;
  message: string;
  details: string | null;
  source: string;
  context: Record<string, unknown>;
  createdAt: string;
}

export interface SystemLogsPage {
  items: SystemLogItem[];
  page: number;
  pageSize: number;
  total: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface PersistedSettings {
  general: GeneralSettings;
  ai: AIPersistedSettings;
  categories: Category[];
  rss: RssSettings;
  logging: LoggingSettings;
}

export type ViewType = 'all' | 'unread' | 'starred' | string;
