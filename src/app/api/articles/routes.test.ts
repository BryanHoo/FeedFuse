import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};

const getArticleByIdMock = vi.fn();
const setArticleReadMock = vi.fn();
const setArticleStarredMock = vi.fn();
const markAllReadMock = vi.fn();
const getFeedFullTextOnOpenEnabledMock = vi.fn();
const getFeedBodyTranslateEnabledMock = vi.fn();
const getAiApiKeyMock = vi.fn();
const enqueueMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../../server/db/pool', () => ({
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
}));
vi.mock('../../../../../server/repositories/settingsRepo', () => ({
  getAiApiKey: (...args: unknown[]) => getAiApiKeyMock(...args),
}));

vi.mock('../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
}));
vi.mock('../../../../../server/queue/queue', () => ({
  enqueue: (...args: unknown[]) => enqueueMock(...args),
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
    enqueueMock.mockReset();
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
    enqueueMock.mockResolvedValue('job-id-1');

    const mod = await import('./[id]/fulltext/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/fulltext`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueMock).toHaveBeenCalledWith(
      'article.fetch_fulltext',
      { articleId },
      expect.objectContaining({ singletonKey: articleId, singletonSeconds: 600 }),
    );
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
    enqueueMock.mockRejectedValue(new Error('Failed to enqueue job'));

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
    enqueueMock.mockResolvedValue('job-id-1');

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueMock).toHaveBeenCalledWith(
      'ai.summarize_article',
      { articleId },
      expect.objectContaining({
        singletonKey: articleId,
        singletonSeconds: 600,
        retryLimit: 8,
        retryDelay: 30,
      }),
    );
  });

  it('POST /:id/ai-summary returns already_enqueued when enqueue rejected', async () => {
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
    enqueueMock.mockRejectedValue(new Error('Failed to enqueue job'));

    const mod = await import('./[id]/ai-summary/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-summary`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_enqueued' });
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
    enqueueMock.mockResolvedValue('job-id-1');

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.enqueued).toBe(true);
    expect(json.data.jobId).toBe('job-id-1');
    expect(enqueueMock).toHaveBeenCalledWith(
      'ai.translate_article_zh',
      { articleId },
      expect.objectContaining({
        singletonKey: articleId,
        singletonSeconds: 600,
        retryLimit: 8,
        retryDelay: 30,
      }),
    );
  });

  it('POST /:id/ai-translate returns already_enqueued when enqueue rejected', async () => {
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
    enqueueMock.mockRejectedValue(new Error('Failed to enqueue job'));

    const mod = await import('./[id]/ai-translate/route');
    const res = await mod.POST(new Request(`http://localhost/api/articles/${articleId}/ai-translate`), {
      params: Promise.resolve({ id: articleId }),
    });
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ enqueued: false, reason: 'already_enqueued' });
  });
});
