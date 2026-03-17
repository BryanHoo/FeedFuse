import ky from 'ky';
import type { Article, Category, Feed, PersistedSettings } from '../types';
import { notifyApiError } from './apiErrorNotifier';
import { isRecord } from './utils';

export interface ApiErrorPayload {
  code: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  status?: number;
  cause?: unknown;

  constructor(
    message: string,
    public code: string,
    public fields?: Record<string, string>,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message);
    this.status = options?.status;
    this.cause = options?.cause;
  }
}

type ApiOk<T> = { ok: true; data: T };
type ApiFail = { ok: false; error: ApiErrorPayload };
type ApiEnvelope<T> = ApiOk<T> | ApiFail;

export interface RequestApiOptions {
  notifyOnError?: boolean;
  notifyMessage?: string;
}

const api = ky.create({
  timeout: 15_000,
  retry: 0,
  throwHttpErrors: false,
});

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

function toAbsoluteUrl(path: string): string {
  return new URL(path, getBaseUrl()).toString();
}

function throwTransportApiError(
  err: unknown,
  options?: RequestApiOptions & { timeoutMs?: number },
): never {
  const isTimeout =
    err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
  const message = isTimeout ? '请求超时，请稍后重试' : '网络异常，请检查网络后重试';
  const code = isTimeout ? 'timeout' : 'network_error';

  if (options?.notifyOnError !== false) {
    notifyApiError(options?.notifyMessage ?? message);
  }

  throw new ApiError(options?.notifyMessage ?? message, code, undefined, { cause: err });
}

function throwInvalidResponseApiError(
  status?: number,
  options?: RequestApiOptions & { timeoutMs?: number },
): never {
  if (options?.notifyOnError !== false) {
    notifyApiError(options?.notifyMessage ?? '暂时无法完成请求，请稍后重试');
  }

  throw new ApiError('服务返回了无效数据，请稍后重试', 'invalid_response', undefined, {
    status,
  });
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const quotedMatch = value.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = value.match(/filename=([^;]+)/i);
  return plainMatch?.[1]?.trim() ?? null;
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.code === 'string' && typeof value.message === 'string';
}

async function requestApi<T>(
  path: string,
  init?: RequestInit,
  options?: RequestApiOptions & { timeoutMs?: number },
): Promise<T> {
  let res: Response;

  try {
    res = await api(toAbsoluteUrl(path), {
      ...(init ?? {}),
      timeout: options?.timeoutMs ?? 15_000,
      headers: {
        ...(init?.headers ?? {}),
        accept: 'application/json',
      },
    });
  } catch (err) {
    throwTransportApiError(err, options);
  }

  const json: unknown = await res.json().catch(() => null);
  if (!isRecord(json) || typeof json.ok !== 'boolean') {
    throwInvalidResponseApiError(res.status, options);
  }

  const envelope = json as ApiEnvelope<T>;
  if (envelope.ok) return envelope.data;

  const payload = envelope.error;
  const message = options?.notifyMessage ?? payload?.message ?? '暂时无法完成请求，请稍后重试';
  if (options?.notifyOnError !== false) {
    notifyApiError(message);
  }

  throw new ApiError(
    payload?.message ?? '暂时无法完成请求，请稍后重试',
    payload?.code ?? 'unknown_error',
    payload?.fields,
    { status: res.status },
  );
}

export interface OpmlImportResult {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdCategoryCount: number;
  duplicates: Array<{ title: string; xmlUrl: string; reason: 'duplicate_in_file' | 'duplicate_in_db' }>;
  invalidItems: Array<{ title: string | null; xmlUrl: string | null; reason: 'missing_xml_url' | 'invalid_url' }>;
}

export async function importOpml(input: {
  content: string;
  fileName?: string | null;
}): Promise<OpmlImportResult> {
  return requestApi('/api/opml/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function exportOpml(): Promise<{ xml: string; fileName: string }> {
  let res: Response;

  try {
    res = await api(toAbsoluteUrl('/api/opml/export'), {
      method: 'GET',
      headers: { accept: 'application/xml, text/xml;q=0.9, */*;q=0.8' },
      timeout: 15_000,
    });
  } catch (err) {
    throwTransportApiError(err);
  }

  if (!res.ok) {
    const json: unknown = await res.json().catch(() => null);
    if (!isRecord(json) || json.ok !== false || !isApiErrorPayload(json.error)) {
      throwInvalidResponseApiError(res.status);
    }

    const payload = json.error;
    const message = payload.message ?? '暂时无法完成请求，请稍后重试';
    notifyApiError(message);
    throw new ApiError(
      payload.message ?? '暂时无法完成请求，请稍后重试',
      payload.code ?? 'unknown_error',
      payload.fields,
      { status: res.status },
    );
  }

  return {
    xml: await res.text(),
    fileName:
      parseContentDispositionFileName(res.headers.get('content-disposition')) ??
      'feedfuse-subscriptions.opml',
  };
}

export type RssValidationErrorCode =
  | 'invalid_url'
  | 'unauthorized'
  | 'timeout'
  | 'not_feed'
  | 'network_error';

export interface RssValidationResult {
  ok: boolean;
  kind?: 'rss' | 'atom';
  title?: string;
  siteUrl?: string;
  errorCode?: RssValidationErrorCode;
  message?: string;
}

type RssValidationEnvelope =
  | {
      ok: true;
      data: {
        valid: boolean;
        reason?: RssValidationErrorCode;
        message?: string;
        kind?: 'rss' | 'atom';
        title?: string;
        siteUrl?: string;
      };
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

export async function validateRssUrl(url: string): Promise<RssValidationResult> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      errorCode: 'invalid_url',
      message: '请输入完整链接，例如 https://example.com/feed.xml',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, errorCode: 'invalid_url', message: '链接必须以 http:// 或 https:// 开头' };
  }

  try {
    const endpoint = new URL('/api/rss/validate', getBaseUrl());
    endpoint.searchParams.set('url', url);

    const res = await api(endpoint.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      timeout: 12_000,
    });

    const json: unknown = await res.json().catch(() => null);
    if (typeof json !== 'object' || json === null || !('ok' in json)) {
      return { ok: false, errorCode: 'network_error', message: '暂时无法验证链接，请稍后重试' };
    }

    const envelope = json as RssValidationEnvelope;

    if (!envelope.ok) {
      return {
        ok: false,
        errorCode: 'network_error',
        message: envelope.error.message,
      };
    }

    if (envelope.data.valid) {
      return {
        ok: true,
        kind: envelope.data.kind,
        title: envelope.data.title,
        siteUrl: envelope.data.siteUrl,
      };
    }

    return {
      ok: false,
      errorCode: envelope.data.reason,
      message: envelope.data.message,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    if (isTimeout) {
      return { ok: false, errorCode: 'timeout', message: '验证超时，请稍后重试' };
    }
    return { ok: false, errorCode: 'network_error', message: '暂时无法验证链接，请稍后重试' };
  }
}

export interface ReaderSnapshotDto {
  categories: Array<{
    id: string;
    name: string;
    position: number;
  }>;
  feeds: Array<{
    id: string;
    kind: Feed['kind'];
    title: string;
    url: string;
    siteUrl: string | null;
    iconUrl: string | null;
    enabled: boolean;
    fullTextOnOpenEnabled: boolean;
    aiSummaryOnOpenEnabled: boolean;
    aiSummaryOnFetchEnabled: boolean;
    bodyTranslateOnFetchEnabled: boolean;
    bodyTranslateOnOpenEnabled: boolean;
    titleTranslateEnabled: boolean;
    bodyTranslateEnabled: boolean;
    articleListDisplayMode: 'card' | 'list';
    categoryId: string | null;
    fetchIntervalMinutes: number;
    lastFetchStatus: number | null;
    lastFetchError: string | null;
    unreadCount: number;
  }>;
  articles: {
    items: Array<{
      id: string;
      feedId: string;
      title: string;
      titleOriginal?: string | null;
      titleZh?: string | null;
      summary: string | null;
      previewImage?: string | null;
      author: string | null;
      publishedAt: string | null;
      link: string | null;
      isRead: boolean;
      isStarred: boolean;
      bodyTranslationEligible?: boolean;
      bodyTranslationBlockedReason?: string | null;
    }>;
    nextCursor: string | null;
  };
}

export async function getReaderSnapshot(
  input?: {
    view?: string;
    limit?: number;
    cursor?: string;
  },
  options?: RequestApiOptions,
): Promise<ReaderSnapshotDto> {
  const params = new URLSearchParams();
  if (input?.view) params.set('view', input.view);
  if (typeof input?.limit === 'number') params.set('limit', String(input.limit));
  if (input?.cursor) params.set('cursor', input.cursor);

  const suffix = params.size > 0 ? `?${params.toString()}` : '';
  return requestApi<ReaderSnapshotDto>(`/api/reader/snapshot${suffix}`, undefined, options);
}

export async function createFeed(input: {
  title: string;
  url: string;
  siteUrl?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  fullTextOnOpenEnabled?: boolean;
  aiSummaryOnOpenEnabled?: boolean;
  aiSummaryOnFetchEnabled?: boolean;
  bodyTranslateOnFetchEnabled?: boolean;
  bodyTranslateOnOpenEnabled?: boolean;
  titleTranslateEnabled?: boolean;
  bodyTranslateEnabled?: boolean;
}): Promise<
  ReaderSnapshotDto['feeds'][number] & {
    unreadCount: number;
  }
> {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value !== 'undefined'),
  );

  return requestApi('/api/feeds', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function createAiDigest(input: {
  title: string;
  prompt: string;
  intervalMinutes: number;
  selectedFeedIds: string[];
  categoryId?: string | null;
  categoryName?: string | null;
}): Promise<
  ReaderSnapshotDto['feeds'][number] & {
    unreadCount: number;
  }
> {
  return requestApi('/api/ai-digests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface AiDigestConfigDto {
  feedId: string;
  prompt: string;
  intervalMinutes: number;
  selectedFeedIds: string[];
}

export async function getAiDigestConfig(feedId: string): Promise<AiDigestConfigDto> {
  return requestApi(`/api/ai-digests/${encodeURIComponent(feedId)}`);
}

export async function patchAiDigest(
  feedId: string,
  input: {
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
  },
): Promise<FeedRowDto> {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value !== 'undefined'),
  );

  return requestApi(`/api/ai-digests/${encodeURIComponent(feedId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function generateAiDigest(
  feedId: string,
): Promise<{ enqueued: boolean; jobId?: string; reason?: string; runId?: string }> {
  return requestApi(`/api/ai-digests/${encodeURIComponent(feedId)}/generate`, {
    method: 'POST',
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
  kind: Feed['kind'];
  title: string;
  url: string;
  siteUrl: string | null;
  iconUrl: string | null;
  enabled: boolean;
  fullTextOnOpenEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  aiSummaryOnFetchEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
  articleListDisplayMode: 'card' | 'list';
  categoryId: string | null;
  fetchIntervalMinutes: number;
}

type FeedDtoLike =
  | ReaderSnapshotDto['feeds'][number]
  | (FeedRowDto & {
      unreadCount?: number;
      lastFetchStatus?: number | null;
      lastFetchError?: string | null;
    });

export async function patchFeed(
  feedId: string,
  input: {
    title?: string;
    url?: string;
    siteUrl?: string | null;
    enabled?: boolean;
    categoryId?: string | null;
    categoryName?: string | null;
    fullTextOnOpenEnabled?: boolean;
    aiSummaryOnOpenEnabled?: boolean;
    aiSummaryOnFetchEnabled?: boolean;
    bodyTranslateOnFetchEnabled?: boolean;
    bodyTranslateOnOpenEnabled?: boolean;
    titleTranslateEnabled?: boolean;
    articleListDisplayMode?: 'card' | 'list';
  },
): Promise<FeedRowDto> {
  const payload = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => key !== 'bodyTranslateEnabled' && typeof value !== 'undefined',
    ),
  );

  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteFeed(feedId: string): Promise<{ deleted: true }> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}`, {
    method: 'DELETE',
  });
}


export async function getFeedKeywordFilter(feedId: string): Promise<{ keywords: string[] }> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}/keyword-filter`);
}

export async function patchFeedKeywordFilter(
  feedId: string,
  input: { keywords: string[] },
): Promise<{ keywords: string[] }> {
  return requestApi(`/api/feeds/${encodeURIComponent(feedId)}/keyword-filter`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
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

export async function reorderCategories(
  items: Array<{ id: string; position: number }>,
): Promise<CategoryDto[]> {
  return requestApi('/api/categories/reorder', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function patchArticle(
  articleId: string,
  input: { isRead?: boolean; isStarred?: boolean },
  options?: RequestApiOptions,
): Promise<{ updated: true }> {
  return requestApi(
    `/api/articles/${encodeURIComponent(articleId)}`,
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  );
}

export async function markAllRead(
  input: { feedId?: string } = {},
  options?: RequestApiOptions,
): Promise<{ updatedCount: number }> {
  return requestApi(
    '/api/articles/mark-all-read',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  );
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
  aiSummarySession?: ArticleAiSummarySessionSnapshotDto | null;
  aiTranslationBilingualHtml: string | null;
  aiTranslationZhHtml: string | null;
  aiTranslationModel: string | null;
  aiTranslatedAt: string | null;
  summary: string | null;
  isRead: boolean;
  readAt: string | null;
  isStarred: boolean;
  starredAt: string | null;
  bodyTranslationEligible?: boolean;
  bodyTranslationBlockedReason?: string | null;
  aiDigestSources?: ArticleAiDigestSourceDto[] | null;
}

export interface ArticleAiDigestSourceDto {
  articleId: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  position: number;
}

export async function getArticle(
  articleId: string,
  options?: RequestApiOptions,
): Promise<ArticleDto> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}`, undefined, options);
}

export type ArticleTaskType = 'fulltext' | 'ai_summary' | 'ai_translate';
export type ArticleTaskStatus = 'idle' | 'queued' | 'running' | 'succeeded' | 'failed';

export interface ArticleTaskDto {
  type: ArticleTaskType;
  status: ArticleTaskStatus;
  jobId: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ArticleTasksDto {
  fulltext: ArticleTaskDto;
  ai_summary: ArticleTaskDto;
  ai_translate: ArticleTaskDto;
}

export async function getArticleTasks(articleId: string): Promise<ArticleTasksDto> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/tasks`);
}

export async function enqueueArticleFulltext(
  articleId: string,
  input?: { force?: boolean },
): Promise<{ enqueued: boolean; jobId?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/fulltext`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: Boolean(input?.force) }),
  });
}

export async function enqueueArticleAiSummary(
  articleId: string,
  input?: { force?: boolean },
): Promise<{ enqueued: boolean; jobId?: string; reason?: string; sessionId?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-summary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: Boolean(input?.force) }),
  });
}

export async function enqueueArticleAiTranslate(
  articleId: string,
  input?: { force?: boolean },
): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-translate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: Boolean(input?.force) }),
  });
}

export type TranslationSessionStatus = 'running' | 'succeeded' | 'partial_failed' | 'failed';
export type TranslationSegmentStatus = 'pending' | 'running' | 'succeeded' | 'failed';
export type AiSummarySessionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ArticleAiSummarySessionSnapshotDto {
  id: string;
  status: AiSummarySessionStatus;
  draftText: string;
  finalText: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ArticleAiSummarySnapshotDto {
  session: ArticleAiSummarySessionSnapshotDto | null;
}

export interface ArticleAiTranslateSessionSnapshotDto {
  id: string;
  articleId: string;
  sourceHtmlHash: string;
  status: TranslationSessionStatus;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  startedAt: string;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ArticleAiTranslateSegmentSnapshotDto {
  id: string;
  segmentIndex: number;
  sourceText: string;
  translatedText: string | null;
  status: TranslationSegmentStatus;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: string;
}

export interface ArticleAiTranslateSnapshotDto {
  session: ArticleAiTranslateSessionSnapshotDto | null;
  segments: ArticleAiTranslateSegmentSnapshotDto[];
}

export async function getArticleAiTranslateSnapshot(
  articleId: string,
): Promise<ArticleAiTranslateSnapshotDto> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-translate`);
}

export async function getArticleAiSummarySnapshot(
  articleId: string,
): Promise<ArticleAiSummarySnapshotDto> {
  return requestApi(`/api/articles/${encodeURIComponent(articleId)}/ai-summary`);
}

export async function retryArticleAiTranslateSegment(
  articleId: string,
  segmentIndex: number,
): Promise<{ enqueued: boolean; jobId?: string; reason?: string }> {
  return requestApi(
    `/api/articles/${encodeURIComponent(articleId)}/ai-translate/segments/${segmentIndex}/retry`,
    {
      method: 'POST',
    },
  );
}

export function createArticleAiTranslateEventSource(articleId: string): EventSource {
  const path = `/api/articles/${encodeURIComponent(articleId)}/ai-translate/stream`;
  return new EventSource(toAbsoluteUrl(path));
}

export function createArticleAiSummaryEventSource(articleId: string): EventSource {
  const path = `/api/articles/${encodeURIComponent(articleId)}/ai-summary/stream`;
  return new EventSource(toAbsoluteUrl(path));
}

export async function getSettings(options?: RequestApiOptions): Promise<PersistedSettings> {
  return requestApi('/api/settings', undefined, options);
}

export async function putSettings(
  input: PersistedSettings,
  options?: RequestApiOptions,
): Promise<PersistedSettings> {
  return requestApi(
    '/api/settings',
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    options,
  );
}

export async function putAiApiKey(input: { apiKey: string }): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/ai/api-key', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getAiApiKeyStatus(
  options?: RequestApiOptions,
): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/ai/api-key', undefined, options);
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

export async function getTranslationApiKeyStatus(
  options?: RequestApiOptions,
): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/translation/api-key', undefined, options);
}

export async function deleteTranslationApiKey(): Promise<{ hasApiKey: boolean }> {
  return requestApi('/api/settings/translation/api-key', {
    method: 'DELETE',
  });
}

export function mapFeedDto(dto: FeedDtoLike, categories: Category[]): Feed {
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  return {
    id: dto.id,
    kind: dto.kind,
    title: dto.title,
    url: dto.url,
    siteUrl: dto.siteUrl,
    icon: dto.iconUrl ?? undefined,
    unreadCount: 'unreadCount' in dto ? dto.unreadCount ?? 0 : 0,
    enabled: dto.enabled,
    fullTextOnOpenEnabled: dto.fullTextOnOpenEnabled,
    aiSummaryOnOpenEnabled: dto.aiSummaryOnOpenEnabled,
    aiSummaryOnFetchEnabled: Boolean(dto.aiSummaryOnFetchEnabled),
    bodyTranslateOnFetchEnabled: Boolean(dto.bodyTranslateOnFetchEnabled),
    bodyTranslateOnOpenEnabled: Boolean(dto.bodyTranslateOnOpenEnabled),
    titleTranslateEnabled: dto.titleTranslateEnabled,
    bodyTranslateEnabled: dto.bodyTranslateEnabled,
    articleListDisplayMode: dto.articleListDisplayMode,
    categoryId: dto.categoryId,
    category: dto.categoryId ? categoryNameById.get(dto.categoryId) ?? null : null,
    fetchStatus: ('lastFetchStatus' in dto ? dto.lastFetchStatus : null) ?? null,
    fetchError: ('lastFetchError' in dto ? dto.lastFetchError : null) ?? null,
  };
}

export function mapSnapshotArticleItem(dto: ReaderSnapshotDto['articles']['items'][number]): Article {
  const titleOriginal = dto.titleOriginal?.trim() ? dto.titleOriginal : dto.title;
  const titleZh = dto.titleZh?.trim() ? dto.titleZh : undefined;
  const effectiveTitle = titleZh ?? dto.title;

  return {
    id: dto.id,
    feedId: dto.feedId,
    title: effectiveTitle,
    titleOriginal,
    titleZh,
    content: '',
    previewImage: dto.previewImage ?? undefined,
    summary: dto.summary ?? '',
    author: dto.author ?? undefined,
    publishedAt: dto.publishedAt ?? new Date().toISOString(),
    link: dto.link ?? '',
    isRead: dto.isRead,
    isStarred: dto.isStarred,
    bodyTranslationEligible: dto.bodyTranslationEligible,
    bodyTranslationBlockedReason: dto.bodyTranslationBlockedReason,
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
    aiSummarySession: dto.aiSummarySession ?? undefined,
    aiTranslationBilingualHtml: dto.aiTranslationBilingualHtml ?? undefined,
    aiTranslationZhHtml: dto.aiTranslationZhHtml ?? undefined,
    summary: dto.summary ?? '',
    author: dto.author ?? undefined,
    publishedAt: dto.publishedAt ?? new Date().toISOString(),
    link: dto.link ?? '',
    isRead: dto.isRead,
    isStarred: dto.isStarred,
    bodyTranslationEligible: dto.bodyTranslationEligible,
    bodyTranslationBlockedReason: dto.bodyTranslationBlockedReason,
    aiDigestSources: dto.aiDigestSources?.map((source) => ({
      articleId: source.articleId,
      feedId: source.feedId,
      feedTitle: source.feedTitle,
      title: source.title,
      link: source.link,
      publishedAt: source.publishedAt,
      position: source.position,
    })) ?? undefined,
  };
}
