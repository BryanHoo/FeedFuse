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
  aiSummarySession?: ArticleAiSummarySession;
  aiTranslationZhHtml?: string;
  aiTranslationBilingualHtml?: string;
  previewImage?: string;
  summary: string;
  author?: string;
  publishedAt: string;
  link: string;
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

export interface ArticleKeywordFilterSettings {
  globalKeywords: string[];
  feedKeywordsByFeedId: Record<string, string[]>;
}

export interface RssSettings {
  sources: RssSourceSetting[];
  fetchIntervalMinutes: 5 | 15 | 30 | 60 | 120;
  articleKeywordFilter: ArticleKeywordFilterSettings;
}

export interface PersistedSettings {
  general: GeneralSettings;
  ai: AIPersistedSettings;
  categories: Category[];
  rss: RssSettings;
}

export type ViewType = 'all' | 'unread' | 'starred' | string;
