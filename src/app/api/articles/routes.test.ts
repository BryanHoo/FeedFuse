import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};

const getArticleByIdMock = vi.fn();
const setArticleReadMock = vi.fn();
const setArticleStarredMock = vi.fn();
const markAllReadMock = vi.fn();
const getFeedFullTextOnOpenEnabledMock = vi.fn();
const getFeedBodyTranslateEnabledMock = vi.fn();
const getAiApiKeyMock = vi.fn();
const getTranslationApiKeyMock = vi.fn();
const getUiSettingsMock = vi.fn();
const enqueueMock = vi.fn();
const enqueueWithResultMock = vi.fn();
const getArticleTasksByArticleIdMock = vi.fn();
const upsertTaskQueuedMock = vi.fn();
const getTranslationSessionByArticleIdMock = vi.fn();
const upsertTranslationSessionMock = vi.fn();
const listTranslationSegmentsBySessionIdMock = vi.fn();
const upsertTranslationSegmentMock = vi.fn();
const deleteTranslationSegmentsBySessionIdMock = vi.fn();
const deleteTranslationEventsBySessionIdMock = vi.fn();
const listTranslationEventsAfterMock = vi.fn();
const extractImmersiveSegmentsMock = vi.fn();
const hashSourceHtmlMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../../server/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
vi.mock('../../../server/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
vi.mock('../../../../../server/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
vi.mock('../../../../../../../../../server/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));
vi.mock('../../../../../../../../server/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));

vi.mock('../../../server/repositories/feedsRepo', () => ({
  getFeedFullTextOnOpenEnabled: (...args: unknown[]) => getFeedFullTextOnOpenEnabledMock(...args),
  getFeedBodyTranslateEnabled: (...args: unknown[]) => getFeedBodyTranslateEnabledMock(...args),
}));
vi.mock('../../../../../server/repositories/feedsRepo', () => ({
  getFeedFullTextOnOpenEnabled: (...args: unknown[]) => getFeedFullTextOnOpenEnabledMock(...args),
  getFeedBodyTranslateEnabled: (...args: unknown[]) => getFeedBodyTranslateEnabledMock(...args),
}));

vi.mock('../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
}));
vi.mock('../../../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
  getTranslationApiKey: (...args: unknown[]) => getTranslationApiKeyMock(...args),
  getUiSettings: (...args: unknown[]) => getUiSettingsMock(...args),
}));

vi.mock('../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));
vi.mock('../../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));
vi.mock('../../../../../../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));
vi.mock('../../../../../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

vi.mock('../../../server/repositories/articleTasksRepo', () => ({
  getArticleTasksByArticleId: (...args: unknown[]) => getArticleTasksByArticleIdMock(...args),
  upsertTaskQueued: (...args: unknown[]) => upsertTaskQueuedMock(...args),
}));
vi.mock('../../../../../server/repositories/articleTranslationRepo', () => ({
  getTranslationSessionByArticleId: (...args: unknown[]) =>
    getTranslationSessionByArticleIdMock(...args),
  upsertTranslationSession: (...args: unknown[]) => upsertTranslationSessionMock(...args),
  listTranslationSegmentsBySessionId: (...args: unknown[]) =>
    listTranslationSegmentsBySessionIdMock(...args),
  listTranslationEventsAfter: (...args: unknown[]) => listTranslationEventsAfterMock(...args),
  upsertTranslationSegment: (...args: unknown[]) => upsertTranslationSegmentMock(...args),
  deleteTranslationSegmentsBySessionId: (...args: unknown[]) =>
    deleteTranslationSegmentsBySessionIdMock(...args),
  deleteTranslationEventsBySessionId: (...args: unknown[]) =>
    deleteTranslationEventsBySessionIdMock(...args),
}));
vi.mock('../../../../../../../../../server/repositories/articleTranslationRepo', () => ({
  getTranslationSessionByArticleId: (...args: unknown[]) =>
    getTranslationSessionByArticleIdMock(...args),
  upsertTranslationSession: (...args: unknown[]) => upsertTranslationSessionMock(...args),
  listTranslationSegmentsBySessionId: (...args: unknown[]) =>
    listTranslationSegmentsBySessionIdMock(...args),
  listTranslationEventsAfter: (...args: unknown[]) => listTranslationEventsAfterMock(...args),
  upsertTranslationSegment: (...args: unknown[]) => upsertTranslationSegmentMock(...args),
  deleteTranslationSegmentsBySessionId: (...args: unknown[]) =>
    deleteTranslationSegmentsBySessionIdMock(...args),
  deleteTranslationEventsBySessionId: (...args: unknown[]) =>
    deleteTranslationEventsBySessionIdMock(...args),
}));
vi.mock('../../../../../../../../server/repositories/articleTranslationRepo', () => ({
  getTranslationSessionByArticleId: (...args: unknown[]) =>
    getTranslationSessionByArticleIdMock(...args),
  upsertTranslationSession: (...args: unknown[]) => upsertTranslationSessionMock(...args),
  listTranslationSegmentsBySessionId: (...args: unknown[]) =>
    listTranslationSegmentsBySessionIdMock(...args),
  listTranslationEventsAfter: (...args: unknown[]) => listTranslationEventsAfterMock(...args),
  upsertTranslationSegment: (...args: unknown[]) => upsertTranslationSegmentMock(...args),
  deleteTranslationSegmentsBySessionId: (...args: unknown[]) =>
    deleteTranslationSegmentsBySessionIdMock(...args),
  deleteTranslationEventsBySessionId: (...args: unknown[]) =>
    deleteTranslationEventsBySessionIdMock(...args),
}));
vi.mock('../../../server/repositories/articleTranslationRepo', () => ({
  getTranslationSessionByArticleId: (...args: unknown[]) =>
    getTranslationSessionByArticleIdMock(...args),
  upsertTranslationSession: (...args: unknown[]) => upsertTranslationSessionMock(...args),
  listTranslationSegmentsBySessionId: (...args: unknown[]) =>
    listTranslationSegmentsBySessionIdMock(...args),
  listTranslationEventsAfter: (...args: unknown[]) => listTranslationEventsAfterMock(...args),
  upsertTranslationSegment: (...args: unknown[]) => upsertTranslationSegmentMock(...args),
  deleteTranslationSegmentsBySessionId: (...args: unknown[]) =>
    deleteTranslationSegmentsBySessionIdMock(...args),
  deleteTranslationEventsBySessionId: (...args: unknown[]) =>
    deleteTranslationEventsBySessionIdMock(...args),
}));
vi.mock('../../../../../server/ai/immersiveTranslationSession', () => ({
  extractImmersiveSegments: (...args: unknown[]) => extractImmersiveSegmentsMock(...args),
  hashSourceHtml: (...args: unknown[]) => hashSourceHtmlMock(...args),
}));
vi.mock('../../../server/ai/immersiveTranslationSession', () => ({
  extractImmersiveSegments: (...args: unknown[]) => extractImmersiveSegmentsMock(...args),
  hashSourceHtml: (...args: unknown[]) => hashSourceHtmlMock(...args),
}));

const articleId = '00000000-0000-0000-0000-000000000000';
const feedId = '22222222-2222-2222-8222-222222222222';

describe('/api/articles', () => {
  beforeEach(() => {
    getArticleByIdMock.mockReset();
    setArticleReadMock.mockReset();
    setArticleStarredMock.mockReset();
    markAllReadMock.mockReset();
    getFeedFullTextOnOpenEnabledMock.mockReset();
    getFeedBodyTranslateEnabledMock.mockReset();
    getAiApiKeyMock.mockReset();
    getTranslationApiKeyMock.mockReset();
    getUiSettingsMock.mockReset();
    enqueueMock.mockReset();
    enqueueWithResultMock.mockReset();
    getArticleTasksByArticleIdMock.mockReset();
    upsertTaskQueuedMock.mockReset();
    getTranslationSessionByArticleIdMock.mockReset();
    upsertTranslationSessionMock.mockReset();
    listTranslationSegmentsBySessionIdMock.mockReset();
    upsertTranslationSegmentMock.mockReset();
    deleteTranslationSegmentsBySessionIdMock.mockReset();
    deleteTranslationEventsBySessionIdMock.mockReset();
    listTranslationEventsAfterMock.mockReset();
    extractImmersiveSegmentsMock.mockReset();
    hashSourceHtmlMock.mockReset();

    getTranslationSessionByArticleIdMock.mockResolvedValue(null);
    getArticleTasksByArticleIdMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({});
    getTranslationApiKeyMock.mockResolvedValue('');
    upsertTranslationSessionMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 1,
      translatedSegments: 0,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    listTranslationSegmentsBySessionIdMock.mockResolvedValue([]);
    upsertTranslationSegmentMock.mockResolvedValue(undefined);
    deleteTranslationSegmentsBySessionIdMock.mockResolvedValue(undefined);
    deleteTranslationEventsBySessionIdMock.mockResolvedValue(undefined);
    listTranslationEventsAfterMock.mockResolvedValue([]);
    extractImmersiveSegmentsMock.mockReturnValue([
      { segmentIndex: 0, tagName: 'p', text: 'rss', domPath: 'body[0]>p[0]' },
    ]);
    hashSourceHtmlMock.mockReturnValue('hash-1');
  });

  it('GET returns article', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: null,
      author: null,
      publishedAt: null,
      contentHtml: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.id).toBe(articleId);
  });

  it('GET /:id returns body translation eligibility', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: 'feed-1',
      title: '标题',
      titleOriginal: '标题',
      titleZh: null,
      contentHtml: '<p>这是简体中文正文。</p>',
      contentFullHtml: null,
      sourceLanguage: null,
      summary: null,
      aiSummary: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      isRead: false,
      isStarred: false,
    });

    const mod = await import('./[id]/route');
    const response = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await response.json();

    expect(json.data.bodyTranslationEligible).toBe(false);
    expect(json.data.bodyTranslationBlockedReason).toBe('source_is_simplified_chinese');
  });

  it('GET returns not_found when missing', async () => {
    getArticleByIdMock.mockResolvedValue(null);

    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: { id: articleId },
    });
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('not_found');
  });

  it('GET /:id/tasks returns idle when no task rows', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getArticleTasksByArticleIdMock.mockResolvedValue([]);

    const mod = await import('./[id]/tasks/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/tasks`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.fulltext.status).toBe('idle');
    expect(json.data.ai_summary.status).toBe('idle');
    expect(json.data.ai_translate.status).toBe('idle');
  });

  it('PATCH is idempotent for read/star', async () => {
    setArticleReadMock.mockResolvedValue(true);
    setArticleStarredMock.mockResolvedValue(true);

    const mod = await import('./[id]/route');

    const res1 = await mod.PATCH(
      new Request(`http://localhost/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isRead: true, isStarred: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json1 = await res1.json();
    expect(json1.ok).toBe(true);

    const res2 = await mod.PATCH(
      new Request(`http://localhost/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isRead: true, isStarred: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json2 = await res2.json();
    expect(json2.ok).toBe(true);
  });

  it('PATCH validates body', async () => {
    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
  });

  it('POST /mark-all-read supports feedId?', async () => {
    markAllReadMock.mockResolvedValue(12);

    const mod = await import('./mark-all-read/route');
    const res = await mod.POST(
      new Request('http://localhost/api/articles/mark-all-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ feedId }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(markAllReadMock).toHaveBeenCalledWith(pool, { feedId });
    expect(json.data.updatedCount).toBe(12);
  });

  it('POST /:id/fulltext returns enqueued=false when disabled', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('POST /:id/fulltext returns enqueued=false when link is missing', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: null,
      author: null,
      publishedAt: null,
      contentHtml: null,
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('POST /:id/fulltext returns enqueued=false when fulltext exists', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: '<p>full</p>',
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('POST /:id/fulltext returns enqueued=false when rss content already looks full', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: `<p>${'a'.repeat(2100)}</p>`,
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: 'short',
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('POST /:id/fulltext enqueues fetch job', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-1' });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'article.fetch_fulltext',
      { articleId },
      expect.objectContaining({ singletonKey: articleId, singletonSeconds: 600 }),
    );
    expect(upsertTaskQueuedMock).toHaveBeenCalledWith(pool, {
      articleId,
      type: 'fulltext',
      jobId: 'job-id-1',
    });
  });

  it('POST /:id/fulltext returns enqueued=false when job is already enqueued', async () => {
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'throttled_or_duplicate' });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(false);
  });

  it('POST /:id/ai-summary returns missing_api_key when key is empty', async () => {
    getAiApiKeyMock.mockResolvedValue('');
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_api_key' });
  });

  it('POST /:id/ai-summary returns fulltext_pending when fulltext is enabled and pending', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'fulltext_pending' });
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-summary returns already_summarized when aiSummary exists', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: 'done',
      aiSummaryModel: 'gpt-4o-mini',
      aiSummarizedAt: '2026-02-28T00:00:00.000Z',
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_summarized' });
  });

  it('POST /:id/ai-summary force=true bypasses already_summarized and enqueues', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: 'done',
      aiSummaryModel: 'gpt-4o-mini',
      aiSummarizedAt: '2026-02-28T00:00:00.000Z',
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-force-1' });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-summary`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      {
        params: Promise.resolve({ id: articleId }),
      },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: true, jobId: 'job-id-force-1' });
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.summarize_article',
      { articleId },
      expect.any(Object),
    );
  });

  it('POST /:id/ai-summary enqueues summarize job', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-1' });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.summarize_article',
      { articleId },
      expect.objectContaining({
        singletonKey: articleId,
        singletonSeconds: 600,
        retryLimit: 0,
      }),
    );
    expect(upsertTaskQueuedMock).toHaveBeenCalledWith(pool, {
      articleId,
      type: 'ai_summary',
      jobId: 'job-id-1',
    });
  });

  it('POST /:id/ai-summary returns already_enqueued when enqueueWithResult reports duplicate', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'throttled_or_duplicate' });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_enqueued' });
    expect(upsertTaskQueuedMock).not.toHaveBeenCalled();
  });

  it('GET /:id/ai-translate returns session snapshot with segments', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 2,
      translatedSegments: 1,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    listTranslationSegmentsBySessionIdMock.mockResolvedValue([
      {
        id: 'seg-1',
        sessionId: 'session-id-1',
        segmentIndex: 0,
        sourceText: 'A',
        translatedText: '甲',
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
      {
        id: 'seg-2',
        sessionId: 'session-id-1',
        segmentIndex: 1,
        sourceText: 'B',
        translatedText: null,
        status: 'running',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
    ]);

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.session.status).toBe('running');
    expect(json.data.segments).toHaveLength(2);
    expect(json.data.segments[0].segmentIndex).toBe(0);
  });

  it('POST /:id/ai-translate create or resume session and returns sessionId', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p><p>B</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    extractImmersiveSegmentsMock.mockReturnValue([
      { segmentIndex: 0, tagName: 'p', text: 'A', domPath: 'body[0]>article[0]>p[0]' },
      { segmentIndex: 1, tagName: 'p', text: 'B', domPath: 'body[0]>article[0]>p[1]' },
    ]);
    upsertTranslationSessionMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 2,
      translatedSegments: 0,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-1' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.sessionId).toBe('session-id-1');
    expect(upsertTranslationSegmentMock).toHaveBeenCalledTimes(2);
  });

  it('POST /:id/ai-translate create or resume session reuses running session idempotently', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-running',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 1,
      translatedSegments: 0,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({
      enqueued: false,
      reason: 'already_enqueued',
      sessionId: 'session-id-running',
    });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
    expect(upsertTranslationSessionMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-translate recreates stale running session when translate task already failed', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-running',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 1,
      translatedSegments: 0,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    getArticleTasksByArticleIdMock.mockResolvedValue([
      {
        id: 'task-1',
        articleId,
        type: 'ai_translate',
        status: 'failed',
        jobId: 'job-old',
        requestedAt: '2026-03-04T00:00:00.000Z',
        startedAt: '2026-03-04T00:00:01.000Z',
        finishedAt: '2026-03-04T00:00:02.000Z',
        attempts: 1,
        errorCode: 'missing_api_key',
        errorMessage: 'Missing translation API key',
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:02.000Z',
      },
    ]);
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-2' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-2');
    expect(deleteTranslationSegmentsBySessionIdMock).toHaveBeenCalledWith(pool, 'session-id-running');
    expect(deleteTranslationEventsBySessionIdMock).toHaveBeenCalledWith(pool, 'session-id-running');
  });

  it('POST /:id/ai-translate returns missing_api_key when key is empty', async () => {
    getAiApiKeyMock.mockResolvedValue('');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_api_key' });
  });

  it('POST /:id/ai-translate returns missing_api_key when dedicated translation key is empty', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-shared-present');
    getTranslationApiKeyMock.mockResolvedValue('');
    getUiSettingsMock.mockResolvedValue({
      ai: {
        translation: {
          useSharedAi: false,
          model: 'gpt-4o-mini',
          apiBaseUrl: 'https://api.openai.com/v1',
        },
      },
    });
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_api_key' });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-translate returns fulltext_pending when fulltext is enabled and pending', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'fulltext_pending' });
  });

  it('POST /:id/ai-translate returns already_translated when aiTranslationZhHtml exists', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: '<p>你好</p>',
      aiTranslationModel: 'gpt-4o-mini',
      aiTranslatedAt: '2026-02-28T00:00:00.000Z',
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_translated' });
  });

  it('POST /:id/ai-translate force=true bypasses already_translated and enqueues', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: '<p>已有翻译</p>',
      aiTranslationModel: 'gpt-4o-mini',
      aiTranslatedAt: '2026-02-28T00:00:00.000Z',
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-force-translate-1' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-force-translate-1');
  });

  it('POST /:id/ai-translate returns body_translate_disabled when feed body translation is disabled', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'body_translate_disabled' });
  });

  it('POST /:id/ai-translate force=true bypasses disabled feed translation and enqueues', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(false);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-force-translate-2' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-force-translate-2');
  });

  it('POST /:id/ai-translate returns source_is_simplified_chinese when article body is already simplified Chinese', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: 'feed-1',
      title: '标题',
      titleOriginal: '标题',
      titleZh: null,
      sourceLanguage: 'zh-CN',
      contentHtml: '<p>这是简体中文正文。</p>',
      contentFullHtml: null,
      contentFullError: null,
      summary: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const response = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json = await response.json();

    expect(json.data).toEqual({ enqueued: false, reason: 'source_is_simplified_chinese' });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-translate force=true bypasses queue singleton dedupe window', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-force-translate-3' });

    const mod = await import('./[id]/ai-translate/route');
    await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );

    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.translate_article_zh',
      { articleId },
      { retryLimit: 0 },
    );
  });

  it('POST /:id/ai-translate returns already_translated when aiTranslationBilingualHtml exists', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: '<div class="ff-bilingual-block">...</div>',
      aiTranslationZhHtml: null,
      aiTranslationModel: 'gpt-4o-mini',
      aiTranslatedAt: '2026-03-03T00:00:00.000Z',
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_translated' });
  });

  it('POST /:id/ai-translate enqueues translate job', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-1' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.translate_article_zh',
      { articleId },
      expect.objectContaining({
        singletonKey: articleId,
        singletonSeconds: 600,
        retryLimit: 0,
      }),
    );
    expect(upsertTaskQueuedMock).toHaveBeenCalledWith(pool, {
      articleId,
      type: 'ai_translate',
      jobId: 'job-id-1',
    });
  });

  it('POST /:id/ai-translate returns already_enqueued when enqueueWithResult reports duplicate', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'throttled_or_duplicate' });

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_enqueued' });
    expect(upsertTaskQueuedMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-translate/segments/:index/retry retries failed segment only', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p><p>B</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'partial_failed',
      totalSegments: 2,
      translatedSegments: 1,
      failedSegments: 1,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    listTranslationSegmentsBySessionIdMock.mockResolvedValue([
      {
        id: 'seg-0',
        sessionId: 'session-id-1',
        segmentIndex: 0,
        sourceText: 'A',
        translatedText: '甲',
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
      {
        id: 'seg-1',
        sessionId: 'session-id-1',
        segmentIndex: 1,
        sourceText: 'B',
        translatedText: null,
        status: 'failed',
        errorCode: 'ai_timeout',
        errorMessage: 'timeout',
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
    ]);
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-retry-1' });

    const mod = await import('./[id]/ai-translate/segments/[index]/retry/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate/segments/1/retry`),
      {
        params: Promise.resolve({ id: articleId, index: '1' }),
      },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: true, jobId: 'job-retry-1' });
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.translate_article_zh',
      { articleId, sessionId: 'session-id-1', segmentIndex: 1 },
      expect.any(Object),
    );
  });

  it('POST /:id/ai-translate/segments/:index/retry returns no-op for succeeded segment', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 1,
      translatedSegments: 1,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    listTranslationSegmentsBySessionIdMock.mockResolvedValue([
      {
        id: 'seg-0',
        sessionId: 'session-id-1',
        segmentIndex: 0,
        sourceText: 'A',
        translatedText: '甲',
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
    ]);

    const mod = await import('./[id]/ai-translate/segments/[index]/retry/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate/segments/0/retry`),
      {
        params: Promise.resolve({ id: articleId, index: '0' }),
      },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_succeeded' });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('ai-translate stream + snapshot + retry APIs keep existing reason semantics', async () => {
    const baseArticle = {
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      link: 'https://example.com/a',
      author: null,
      publishedAt: null,
      contentHtml: '<article><p>A</p></article>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    };

    const translateRoute = await import('./[id]/ai-translate/route');

    getArticleByIdMock.mockResolvedValue(baseArticle);
    getAiApiKeyMock.mockResolvedValue('');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    let res = await translateRoute.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`),
      { params: Promise.resolve({ id: articleId }) },
    );
    let json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_api_key' });

    getAiApiKeyMock.mockResolvedValue('sk-test');
    getFeedBodyTranslateEnabledMock.mockResolvedValue(false);
    res = await translateRoute.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`),
      { params: Promise.resolve({ id: articleId }) },
    );
    json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'body_translate_disabled' });

    getFeedBodyTranslateEnabledMock.mockResolvedValue(true);
    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(true);
    getArticleByIdMock.mockResolvedValue({
      ...baseArticle,
      contentFullHtml: null,
      contentFullError: null,
    });
    res = await translateRoute.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`),
      { params: Promise.resolve({ id: articleId }) },
    );
    json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'fulltext_pending' });

    getFeedFullTextOnOpenEnabledMock.mockResolvedValue(false);
    getTranslationSessionByArticleIdMock.mockResolvedValue(null);
    const snapshotRes = await translateRoute.GET(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate`),
      { params: Promise.resolve({ id: articleId }) },
    );
    const snapshotJson = await snapshotRes.json();
    expect(snapshotJson.ok).toBe(true);
    expect(snapshotJson.data).toEqual({ session: null, segments: [] });

    getTranslationSessionByArticleIdMock.mockResolvedValue({
      id: 'session-id-1',
      articleId,
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 1,
      translatedSegments: 1,
      failedSegments: 0,
      startedAt: '2026-03-04T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-04T00:00:00.000Z',
      updatedAt: '2026-03-04T00:00:00.000Z',
    });
    listTranslationSegmentsBySessionIdMock.mockResolvedValue([
      {
        id: 'seg-0',
        sessionId: 'session-id-1',
        segmentIndex: 0,
        sourceText: 'A',
        translatedText: '甲',
        status: 'succeeded',
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: '2026-03-04T00:00:00.000Z',
        updatedAt: '2026-03-04T00:00:00.000Z',
      },
    ]);
    const retryRoute = await import('./[id]/ai-translate/segments/[index]/retry/route');
    const retryRes = await retryRoute.POST(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate/segments/0/retry`),
      { params: Promise.resolve({ id: articleId, index: '0' }) },
    );
    const retryJson = await retryRes.json();
    expect(retryJson.ok).toBe(true);
    expect(retryJson.data).toEqual({ enqueued: false, reason: 'already_succeeded' });

    const streamRoute = await import('./[id]/ai-translate/stream/route');
    const abortController = new AbortController();
    const streamRes = await streamRoute.GET(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate/stream`, {
        signal: abortController.signal,
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
    abortController.abort();
  });
});
