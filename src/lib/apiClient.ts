import type { Article, Category, Feed, PersistedSettings } from '../types';

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

type ApiOk<T> = { ok: true; data: T };
type ApiFail = { ok: false; error: ApiErrorPayload };
type ApiEnvelope<T> = ApiOk<T> | ApiFail;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, getBaseUrl()).toString();
}

async function requestApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(toAbsoluteUrl(path), {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      accept: 'application/json',
    },
  });

  const json: unknown = await res.json().catch(() => null);
  if (!isRecord(json) || typeof json.ok !== 'boolean') {
    throw new Error('Invalid API response');
  }

  const envelope = json as ApiEnvelope<T>;
  if (envelope.ok) return envelope.data;

  const payload = envelope.error;
  throw new ApiError(
    payload?.message ?? 'Request failed',
    payload?.code ?? 'unknown_error',
    payload?.fields,
  );
}

export interface ReaderSnapshotDto {
  categories: Array<{
    id: string;
    name: string;
    position: number;
  }>;
  feeds: Array<{
    id: string;
    title: string;
    url: string;
    siteUrl: string | null;
    iconUrl: string | null;
    enabled: boolean;
    fullTextOnOpenEnabled: boolean;
    aiSummaryOnOpenEnabled: boolean;
    titleTranslateEnabled: boolean;
    bodyTranslateEnabled: boolean;
    articleListDisplayMode: 'card' | 'list';
    categoryId: string | null;
    fetchIntervalMinutes: number;
    unreadCount: number;
  }>;
  articles: {
    items: Array<{
      id: string;
      feedId: string;
      title: string;
      summary: string | null;
      previewImage?: string | null;
      author: string | null;
      publishedAt: string | null;
      link: string | null;
      isRead: boolean;
      isStarred: boolean;
    }>;
    nextCursor: string | null;
  };
}

export async function getReaderSnapshot(input?: {
  view?: string;
  limit?: number;
  cursor?: string;
}): Promise<ReaderSnapshotDto> {
  const params = new URLSearchParams();
  if (input?.view) params.set('view', input.view);
  if (typeof input?.limit === 'number') params.set('limit', String(input.limit));
  if (input?.cursor) params.set('cursor', input.cursor);

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return requestApi<ReaderSnapshotDto>(`/api/reader/snapshot${suffix}`);
}

export async function createFeed(input: {
  title: string;
  url: string;
  siteUrl?: string | null;
  categoryId: string | null;
  fullTextOnOpenEnabled?: boolean;
  aiSummaryOnOpenEnabled?: boolean;
  titleTranslateEnabled?: boolean;
  bodyTranslateEnabled?: boolean;
}): Promise<
  ReaderSnapshotDto['feeds'][number] & {
    unreadCount: number;
  }
> {
  return requestApi('/api/feeds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function refreshFeed(feedId: string): Promise<{ enqueued: true; jobId: string }> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}/refresh`, {
    method: 'POST',
  });
}

export async function refreshAllFeeds(): Promise<{ enqueued: true; jobId: string }> {
  return requestApi('/api/feeds/refresh', {
    method: 'POST',
  });
}

export interface FeedRowDto {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  iconUrl: string | null;
  enabled: boolean;
  fullTextOnOpenEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
  articleListDisplayMode: 'card' | 'list';
  categoryId: string | null;
  fetchIntervalMinutes: number;
}

export async function patchFeed(
  feedId: string,
  input: {
    title?: string;
    url?: string;
    siteUrl?: string | null;
    enabled?: boolean;
    categoryId?: string | null;
    fullTextOnOpenEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    bodyTranslateEnabled?: boolean;
    articleListDisplayMode?: 'card' | 'list';
  },
): Promise<FeedRowDto> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteFeed(feedId: string): Promise<{ deleted: true }> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}`, {
    method: 'DELETE',
  });
}

export interface CategoryDto {
  id: string;
  name: string;
  position: number;
}

export async function listCategories(): Promise<CategoryDto[]> {
  return requestApi('/api/categories');
}

export async function createCategory(input: { name: string }): Promise<CategoryDto> {
  return requestApi('/api/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function patchCategory(
  categoryId: string,
  input: { name?: string; position?: number },
): Promise<CategoryDto> {
  return requestApi(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteCategory(categoryId: string): Promise<{ deleted: true }> {
  return requestApi(`/api/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  });
}

export async function patchArticle(
  articleId: string,
  input: { isRead?: boolean; isStarred?: boolean },
): Promise<{ updated: true }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function markAllRead(input: { feedId?: string } = {}): Promise<{ updatedCount: number }> {
  return requestApi('/api/articles/mark-all-read', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface ArticleDto {
  id: string;
  feedId: string;
  dedupeKey: string;
  title: string;
  titleOriginal: string;
  titleZh: string | null;
  link: string | null;
  author: string | null;
  publishedAt: string | null;
  contentHtml: string | null;
  contentFullHtml: string | null;
  contentFullFetchedAt: string | null;
  contentFullError: string | null;
  contentFullSourceUrl: string | null;
  aiSummary: string | null;
  aiSummaryModel: string | null;
  aiSummarizedAt: string | null;
  aiTranslationBilingualHtml: string | null;
  aiTranslationZhHtml: string | null;
  aiTranslationModel: string | null;
  aiTranslatedAt: string | null;
  summary: string | null;
  isRead: boolean;
  readAt: string | null;
  isStarred: boolean;
  starredAt: string | null;
}

export async function getArticle(articleId: string): Promise<ArticleDto> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}`);
}

export async function enqueueArticleFulltext(
  articleId: string,
): Promise<{ enqueued: boolean; jobId?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/fulltext`, {
    method: 'POST',
  });
}

export async function enqueueArticleAiSummary(
  articleId: string,
): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-summary`, {
    method: 'POST',
  });
}

export async function enqueueArticleAiTranslate(
  articleId: string,
): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-translate`, {
    method: 'POST',
  });
}

export async function getSettings(): Promise<PersistedSettings> {
  return requestApi('/api/settings');
}

export async function putSettings(input: PersistedSettings): Promise<PersistedSettings> {
  return requestApi('/api/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function putAiApiKey(input: { apiKey: string }): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/ai/api-key', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getAiApiKeyStatus(): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/ai/api-key');
}

export async function deleteAiApiKey(): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/ai/api-key', {
    method: 'DELETE',
  });
}

export async function putTranslationApiKey(input: { apiKey: string }): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/translation/api-key', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getTranslationApiKeyStatus(): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/translation/api-key');
}

export async function deleteTranslationApiKey(): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/translation/api-key', {
    method: 'DELETE',
  });
}

export function mapFeedDto(dto: ReaderSnapshotDto['feeds'][number], categories: Category[]): Feed {
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  return {
    id: dto.id,
    title: dto.title,
    url: dto.url,
    siteUrl: dto.siteUrl,
    icon: dto.iconUrl ?? undefined,
    unreadCount: dto.unreadCount,
    enabled: dto.enabled,
    fullTextOnOpenEnabled: dto.fullTextOnOpenEnabled,
    aiSummaryOnOpenEnabled: dto.aiSummaryOnOpenEnabled,
    titleTranslateEnabled: dto.titleTranslateEnabled,
    bodyTranslateEnabled: dto.bodyTranslateEnabled,
    articleListDisplayMode: dto.articleListDisplayMode,
    categoryId: dto.categoryId,
    category: dto.categoryId ? categoryNameById.get(dto.categoryId) ?? null : null,
  };
}

export function mapSnapshotArticleItem(dto: ReaderSnapshotDto['articles']['items'][number]): Article {
  return {
    id: dto.id,
    feedId: dto.feedId,
    title: dto.title,
    content: '',
    previewImage: dto.previewImage ?? undefined,
    summary: dto.summary ?? '',
    author: dto.author ?? undefined,
    publishedAt: dto.publishedAt ?? new Date().toISOString(),
    link: dto.link ?? '',
    isRead: dto.isRead,
    isStarred: dto.isStarred,
  };
}

export function mapArticleDto(dto: ArticleDto): Article {
  return {
    id: dto.id,
    feedId: dto.feedId,
    title: dto.title,
    titleOriginal: dto.titleOriginal,
    titleZh: dto.titleZh ?? undefined,
    content: dto.contentFullHtml ?? dto.contentHtml ?? '',
    aiSummary: dto.aiSummary ?? undefined,
    aiTranslationBilingualHtml: dto.aiTranslationBilingualHtml ?? undefined,
    aiTranslationZhHtml: dto.aiTranslationZhHtml ?? undefined,
    summary: dto.summary ?? '',
    author: dto.author ?? undefined,
    publishedAt: dto.publishedAt ?? new Date().toISOString(),
    link: dto.link ?? '',
    isRead: dto.isRead,
    isStarred: dto.isStarred,
  };
}
