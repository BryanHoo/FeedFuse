import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolQueryMock = vi.fn();
const pool = { query: poolQueryMock };

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
const getActiveAiSummarySessionByArticleIdMock = vi.fn();
const upsertAiSummarySessionMock = vi.fn();
const markAiSummarySessionSupersededMock = vi.fn();
const extractImmersiveSegmentsMock = vi.fn();
const hashSourceHtmlMock = vi.fn();
const writeSystemLogMock = vi.fn();
const writeUserOperationStartedLogMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

const challengeSourceUrl =
  'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=test&target_url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc';
const challengeContentHtml =
  '<div><h2>环境异常</h2><p>当前环境异常，完成验证后即可继续访问。</p><p><a>去验证</a></p></div>';

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

vi.mock('../../../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('../../../../../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('../../../../../../../../server/logging/systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));
vi.mock('../../../server/logging/userOperationLogger', () => ({
  writeUserOperationStartedLog: (...args: unknown[]) =>
    writeUserOperationStartedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));
vi.mock('../../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationStartedLog: (...args: unknown[]) =>
    writeUserOperationStartedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));
vi.mock('../../../../../../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationStartedLog: (...args: unknown[]) =>
    writeUserOperationStartedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));
vi.mock('../../../../../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationStartedLog: (...args: unknown[]) =>
    writeUserOperationStartedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
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
vi.mock('../../../server/repositories/articleAiSummaryRepo', () => ({
  getActiveAiSummarySessionByArticleId: (...args: unknown[]) =>
    getActiveAiSummarySessionByArticleIdMock(...args),
  upsertAiSummarySession: (...args: unknown[]) => upsertAiSummarySessionMock(...args),
  markAiSummarySessionSuperseded: (...args: unknown[]) =>
    markAiSummarySessionSupersededMock(...args),
}));
vi.mock('../../../../../server/repositories/articleAiSummaryRepo', () => ({
  getActiveAiSummarySessionByArticleId: (...args: unknown[]) =>
    getActiveAiSummarySessionByArticleIdMock(...args),
  upsertAiSummarySession: (...args: unknown[]) => upsertAiSummarySessionMock(...args),
  markAiSummarySessionSuperseded: (...args: unknown[]) =>
    markAiSummarySessionSupersededMock(...args),
}));
vi.mock('../../../../../../../../../server/repositories/articleAiSummaryRepo', () => ({
  getActiveAiSummarySessionByArticleId: (...args: unknown[]) =>
    getActiveAiSummarySessionByArticleIdMock(...args),
  upsertAiSummarySession: (...args: unknown[]) => upsertAiSummarySessionMock(...args),
  markAiSummarySessionSuperseded: (...args: unknown[]) =>
    markAiSummarySessionSupersededMock(...args),
}));
vi.mock('../../../../../../../../server/repositories/articleAiSummaryRepo', () => ({
  getActiveAiSummarySessionByArticleId: (...args: unknown[]) =>
    getActiveAiSummarySessionByArticleIdMock(...args),
  upsertAiSummarySession: (...args: unknown[]) => upsertAiSummarySessionMock(...args),
  markAiSummarySessionSuperseded: (...args: unknown[]) =>
    markAiSummarySessionSupersededMock(...args),
}));
vi.mock('../../../../../server/ai/immersiveTranslationSession', () => ({
  extractImmersiveSegments: (...args: unknown[]) => extractImmersiveSegmentsMock(...args),
  hashSourceHtml: (...args: unknown[]) => hashSourceHtmlMock(...args),
}));
vi.mock('../../../server/ai/immersiveTranslationSession', () => ({
  extractImmersiveSegments: (...args: unknown[]) => extractImmersiveSegmentsMock(...args),
  hashSourceHtml: (...args: unknown[]) => hashSourceHtmlMock(...args),
}));

const articleId = '3001';
const feedId = '2001';

describe('/api/articles', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
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
    getActiveAiSummarySessionByArticleIdMock.mockReset();
    upsertAiSummarySessionMock.mockReset();
    markAiSummarySessionSupersededMock.mockReset();
    extractImmersiveSegmentsMock.mockReset();
    hashSourceHtmlMock.mockReset();
    writeSystemLogMock.mockReset();
    writeUserOperationStartedLogMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
    poolQueryMock.mockReset();

    getTranslationSessionByArticleIdMock.mockResolvedValue(null);
    getArticleTasksByArticleIdMock.mockResolvedValue([]);
    getUiSettingsMock.mockResolvedValue({
      ai: {
        model: 'gpt-4o-mini',
        apiBaseUrl: 'https://ai.example.com/v1',
        translation: {
          useSharedAi: true,
          model: '',
          apiBaseUrl: '',
        },
      },
    });
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
    poolQueryMock.mockResolvedValue({ rows: [] });
    listTranslationEventsAfterMock.mockResolvedValue([]);
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue(null);
    upsertAiSummarySessionMock.mockResolvedValue({
      id: 'summary-session-id-1',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'queued',
      draftText: '',
      finalText: null,
      model: null,
      jobId: null,
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
    });
    markAiSummarySessionSupersededMock.mockResolvedValue(undefined);
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
      filterStatus: 'filtered',
      isFiltered: true,
      filteredBy: ['keyword'],
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
    expect(json.data.filterStatus).toBe('filtered');
    expect(json.data.isFiltered).toBe(true);
    expect(json.data.filteredBy).toEqual(['keyword']);
  });

  it('GET accepts numeric route id', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: '3001',
      feedId: '2001',
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
    const res = await mod.GET(new Request('http://localhost/api/articles/3001'), {
      params: Promise.resolve({ id: '3001' }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(getArticleByIdMock).toHaveBeenCalledWith(pool, '3001');
  });

  it('GET returns article with aiSummarySession snapshot', async () => {
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
      link: null,
      author: null,
      publishedAt: null,
      contentHtml: null,
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      previewImageUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      sourceLanguage: 'en',
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'session-1',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-1',
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });

    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.aiSummarySession).toEqual({
      id: 'session-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      errorCode: null,
      errorMessage: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
  });

  it('GET rewrites article html images through proxy', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');
    vi.stubEnv('IMAGE_PROXY_SECRET', 'test-image-proxy-secret');

    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Hello',
      titleOriginal: 'Hello',
      titleZh: null,
      link: 'https://example.com/article',
      author: null,
      publishedAt: null,
      contentHtml:
        '<article><p>A</p><img src="https://img.example.com/a.jpg" srcset="https://img.example.com/a.jpg 1x, https://img.example.com/a@2x.jpg 2x" /></article>',
      contentFullHtml: '<article><img src="https://img.example.com/full.jpg" /></article>',
      aiTranslationBilingualHtml:
        '<article><img src="https://img.example.com/bilingual.jpg" /></article>',
      aiTranslationZhHtml: '<article><img src="https://img.example.com/zh.jpg" /></article>',
      summary: null,
      sourceLanguage: 'en',
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummaryError: null,
      aiSummaryAttempts: 0,
      aiSummaryUpdatedAt: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      aiTranslationModel: null,
      aiTranslationAttempts: 0,
      aiTranslationError: null,
      aiTranslationUpdatedAt: null,
      titleTranslationModel: null,
      titleTranslationAttempts: 0,
      titleTranslationError: null,
      titleTranslatedAt: null,
      aiSummarizedAt: null,
      aiTranslatedAt: null,
      previewImageUrl: null,
    });

    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.contentHtml).toContain('/api/media/image?');
    expect(json.data.contentHtml).not.toContain('q=');
    expect(json.data.contentHtml).toContain('srcset="/api/media/image?');
    expect(json.data.contentFullHtml).toContain('/api/media/image?');
    expect(json.data.aiTranslationBilingualHtml).toContain('/api/media/image?');
    expect(json.data.aiTranslationZhHtml).toContain('/api/media/image?');
  });

  it('GET keeps article html images unchanged when IMAGE_PROXY_SECRET is missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgres://example');

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
      link: 'https://example.com/article',
      author: null,
      publishedAt: null,
      contentHtml: '<article><img src="https://img.example.com/a.jpg" /></article>',
      contentFullHtml: '<article><img src="https://img.example.com/full.jpg" /></article>',
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      previewImageUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: '<article><img src="https://img.example.com/bilingual.jpg" /></article>',
      aiTranslationZhHtml: '<article><img src="https://img.example.com/zh.jpg" /></article>',
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      sourceLanguage: 'en',
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
    expect(json.data.contentHtml).toContain('https://img.example.com/a.jpg');
    expect(json.data.contentHtml).not.toContain('/api/media/image?');
    expect(json.data.contentFullHtml).toContain('https://img.example.com/full.jpg');
    expect(json.data.aiTranslationBilingualHtml).toContain('https://img.example.com/bilingual.jpg');
    expect(json.data.aiTranslationZhHtml).toContain('https://img.example.com/zh.jpg');
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

  it('GET /:id hides stored verification pages from contentFullHtml', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: 'feed-1',
      title: '标题',
      titleOriginal: '标题',
      titleZh: null,
      contentHtml: '<p>rss</p>',
      contentFullHtml: challengeContentHtml,
      contentFullSourceUrl: challengeSourceUrl,
      sourceLanguage: 'en',
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

    expect(json.ok).toBe(true);
    expect(json.data.contentFullHtml).toBeNull();
    expect(json.data.contentHtml).toBe('<p>rss</p>');
  });

  it('GET returns aiDigestSources ordered by position', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId,
      dedupeKey: 'guid:1',
      title: 'Digest',
      titleOriginal: 'Digest',
      titleZh: null,
      link: null,
      author: null,
      publishedAt: null,
      contentHtml: '<p>digest</p>',
      contentFullHtml: null,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: null,
      previewImageUrl: null,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      sourceLanguage: 'en',
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    poolQueryMock.mockResolvedValue({
      rows: [
      {
        articleId: 'a-1',
        feedId: 'f-1',
        feedTitle: 'Feed 1',
        title: 'S1',
        link: 'https://x/1',
        publishedAt: '2026-03-17T00:00:00.000Z',
        position: 0,
      },
      {
        articleId: 'a-2',
        feedId: 'f-2',
        feedTitle: 'Feed 2',
        title: 'S2',
        link: 'https://x/2',
        publishedAt: '2026-03-16T00:00:00.000Z',
        position: 1,
      },
      ],
    });

    const mod = await import('./[id]/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.data.aiDigestSources).toHaveLength(2);
    expect(json.data.aiDigestSources[0].position).toBe(0);
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

  it('GET /:id/tasks returns rawErrorMessage for failed tasks', async () => {
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
    getArticleTasksByArticleIdMock.mockResolvedValue([
      {
        type: 'ai_translate',
        status: 'failed',
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
        rawErrorMessage: '429 rate limit',
        jobId: 'job-1',
        requestedAt: null,
        startedAt: null,
        finishedAt: null,
        attempts: 1,
      },
    ]);

    const mod = await import('./[id]/tasks/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/tasks`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.ai_translate.rawErrorMessage).toBe('429 rate limit');
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

  it('PATCH writes article.markRead success log through the shared helper', async () => {
    setArticleReadMock.mockResolvedValue(true);

    const mod = await import('./[id]/route');
    await mod.PATCH(
      new Request(`http://localhost/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );

    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ actionKey: 'article.markRead' }),
    );
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
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ actionKey: 'article.markAllRead' }),
    );
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

  it('POST /:id/fulltext force=true bypasses disabled flag and enqueues', async () => {
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
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-force-1' });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(
      new Request(`http://localhost/api/articles/${articleId}/fulltext`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
      { params: Promise.resolve({ id: articleId }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-force-1');
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

  it('POST /:id/fulltext re-enqueues when stored fulltext is only a verification page', async () => {
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
      contentFullHtml: challengeContentHtml,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: challengeSourceUrl,
      summary: null,
      isRead: false,
      readAt: null,
      isStarred: false,
      starredAt: null,
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-challenge-1' });

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: true, jobId: 'job-id-challenge-1' });
    expect(enqueueWithResultMock).toHaveBeenCalled();
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

  it('POST /:id/ai-summary returns missing_ai_config when shared AI config is incomplete', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-test');
    getUiSettingsMock.mockResolvedValue({
      ai: {
        model: '',
        apiBaseUrl: '',
      },
    });
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
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_ai_config' });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('GET /:id/ai-summary returns active summary session snapshot', async () => {
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
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'summary-session-id-1',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-id-1',
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.GET(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.session.status).toBe('running');
    expect(json.data.session.draftText).toBe('TL;DR');
    expect(json.data.session.rawErrorMessage).toBeNull();
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

  it('POST /:id/ai-summary treats stored verification page fulltext as pending', async () => {
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
      contentFullHtml: challengeContentHtml,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: challengeSourceUrl,
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
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'summary-session-old',
      articleId,
      sourceTextHash: 'hash-old',
      status: 'succeeded',
      draftText: '旧摘要',
      finalText: '旧摘要',
      model: 'gpt-4o-mini',
      jobId: 'job-old',
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-08T00:00:00.000Z',
      finishedAt: '2026-03-08T00:00:05.000Z',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:05.000Z',
    });
    upsertAiSummarySessionMock.mockResolvedValue({
      id: 'summary-session-new',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'queued',
      draftText: '',
      finalText: null,
      model: null,
      jobId: null,
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
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
    expect(json.data).toEqual({
      enqueued: true,
      jobId: 'job-id-force-1',
      sessionId: 'summary-session-new',
    });
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.summarize_article',
      expect.objectContaining({
        articleId,
        sessionId: 'summary-session-new',
        sharedConfigFingerprint: expect.any(String),
      }),
      expect.objectContaining({
        retryLimit: 0,
      }),
    );
    expect(markAiSummarySessionSupersededMock).toHaveBeenCalledWith(pool, {
      sessionId: 'summary-session-old',
      supersededBySessionId: 'summary-session-new',
    });
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
    expect(json.data.sessionId).toBe('summary-session-id-1');
    expect(enqueueWithResultMock).toHaveBeenCalledWith(
      'ai.summarize_article',
      expect.objectContaining({
        articleId,
        sessionId: 'summary-session-id-1',
        sharedConfigFingerprint: expect.any(String),
      }),
      expect.objectContaining({
        singletonKey: articleId,
        singletonSeconds: 600,
        retryLimit: 0,
      }),
    );
    expect(upsertAiSummarySessionMock).toHaveBeenNthCalledWith(
      1,
      pool,
      expect.not.objectContaining({ sessionId: expect.anything() }),
    );
    expect(upsertTaskQueuedMock).toHaveBeenCalledWith(pool, {
      articleId,
      type: 'ai_summary',
      jobId: 'job-id-1',
    });
    expect(writeUserOperationStartedLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        actionKey: 'article.aiSummary.generate',
      }),
    );
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
    expect(json.data).toEqual({
      enqueued: false,
      reason: 'already_enqueued',
      sessionId: 'summary-session-id-1',
    });
    expect(upsertTaskQueuedMock).not.toHaveBeenCalled();
    expect(writeUserOperationStartedLogMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-summary force=true keeps the running session when enqueue is duplicate', async () => {
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
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'summary-session-running',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR\n- 第一条',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-id-running-1',
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
    upsertAiSummarySessionMock.mockResolvedValue({
      id: 'summary-session-new',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'queued',
      draftText: '',
      finalText: null,
      model: null,
      jobId: null,
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:01:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:01:00.000Z',
      updatedAt: '2026-03-09T00:01:00.000Z',
    });
    enqueueWithResultMock.mockResolvedValue({ status: 'throttled_or_duplicate' });

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
    expect(json.data).toEqual({
      enqueued: false,
      reason: 'already_enqueued',
      sessionId: 'summary-session-running',
    });
    expect(markAiSummarySessionSupersededMock).not.toHaveBeenCalled();
    expect(upsertTaskQueuedMock).not.toHaveBeenCalled();
  });

  it('POST /:id/ai-summary recreates stale running session when summary task already failed', async () => {
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
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'summary-session-running',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-old',
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
    getArticleTasksByArticleIdMock.mockResolvedValue([
      {
        id: 'task-summary-1',
        articleId,
        type: 'ai_summary',
        status: 'failed',
        jobId: 'job-old',
        requestedAt: '2026-03-09T00:00:00.000Z',
        startedAt: '2026-03-09T00:00:01.000Z',
        finishedAt: '2026-03-09T00:00:02.000Z',
        attempts: 1,
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:02.000Z',
      },
    ]);
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-2' });

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-2');
    expect(upsertTaskQueuedMock).toHaveBeenCalledWith(pool, {
      articleId,
      type: 'ai_summary',
      jobId: 'job-id-2',
    });
    expect(markAiSummarySessionSupersededMock).toHaveBeenCalledWith(pool, {
      sessionId: 'summary-session-running',
      supersededBySessionId: 'summary-session-id-1',
    });
  });

  it('POST /:id/ai-summary recreates stale running session when summary task running is too old', async () => {
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
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({
      id: 'summary-session-running',
      articleId,
      sourceTextHash: 'hash-1',
      status: 'running',
      draftText: 'TL;DR',
      finalText: null,
      model: 'gpt-4o-mini',
      jobId: 'job-old',
      errorCode: null,
      errorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
    getArticleTasksByArticleIdMock.mockResolvedValue([
      {
        id: 'task-summary-1',
        articleId,
        type: 'ai_summary',
        status: 'running',
        jobId: 'job-old',
        requestedAt: '2026-03-09T00:00:00.000Z',
        startedAt: '2026-03-09T00:00:01.000Z',
        finishedAt: null,
        attempts: 1,
        errorCode: null,
        errorMessage: null,
        createdAt: '2026-03-09T00:00:00.000Z',
        updatedAt: '2026-03-09T00:00:10.000Z',
      },
    ]);
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-id-2' });

    const dateNowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-03-09T01:00:00.000Z').getTime());

    try {
      const mod = await import('./[id]/ai-summary/route');
      const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
        params: Promise.resolve({ id: articleId }),
      });
      const json = await res.json();

      expect(json.ok).toBe(true);
      expect(json.data.enqueued).toBe(true);
      expect(json.data.jobId).toBe('job-id-2');
      expect(markAiSummarySessionSupersededMock).toHaveBeenCalledWith(pool, {
        sessionId: 'summary-session-running',
        supersededBySessionId: 'summary-session-id-1',
      });
    } finally {
      dateNowSpy.mockRestore();
    }
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
      rawErrorMessage: 'translation session failure',
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
        rawErrorMessage: null,
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
        rawErrorMessage: '429 rate limit',
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
    expect(json.data.session.rawErrorMessage).toBe('translation session failure');
    expect(json.data.segments).toHaveLength(2);
    expect(json.data.segments[0].segmentIndex).toBe(0);
    expect(json.data.segments[1].rawErrorMessage).toBe('429 rate limit');
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

  it('POST /:id/ai-translate returns missing_ai_config when dedicated translation config is incomplete', async () => {
    getAiApiKeyMock.mockResolvedValue('sk-shared-present');
    getTranslationApiKeyMock.mockResolvedValue('sk-dedicated-present');
    getUiSettingsMock.mockResolvedValue({
      ai: {
        model: 'gpt-4o-mini',
        apiBaseUrl: 'https://ai.example.com/v1',
        translation: {
          useSharedAi: false,
          model: '',
          apiBaseUrl: '',
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
    expect(json.data).toEqual({ enqueued: false, reason: 'missing_ai_config' });
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

  it('POST /:id/ai-translate treats stored verification page fulltext as pending', async () => {
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
      contentFullHtml: challengeContentHtml,
      contentFullFetchedAt: null,
      contentFullError: null,
      contentFullSourceUrl: challengeSourceUrl,
      aiSummary: null,
      aiSummaryModel: null,
      aiSummarizedAt: null,
      aiTranslationBilingualHtml: null,
      aiTranslationZhHtml: null,
      aiTranslationModel: null,
      aiTranslatedAt: null,
      summary: null,
      sourceLanguage: 'en',
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
      expect.objectContaining({
        articleId,
        translationConfigFingerprint: expect.any(String),
      }),
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
      expect.objectContaining({
        articleId,
        translationConfigFingerprint: expect.any(String),
      }),
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
    expect(writeUserOperationStartedLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        actionKey: 'article.aiTranslate.generate',
      }),
    );
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
    expect(writeUserOperationStartedLogMock).not.toHaveBeenCalled();
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
    expect(writeUserOperationStartedLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        actionKey: 'article.aiTranslate.retrySegment',
      }),
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
    expect(writeUserOperationStartedLogMock).not.toHaveBeenCalled();
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
