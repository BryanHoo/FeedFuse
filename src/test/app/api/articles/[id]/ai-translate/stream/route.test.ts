import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const articleId = '3001';

const getArticleByIdMock = vi.fn();
const getTranslationSessionByArticleIdMock = vi.fn();
const listTranslationEventsAfterMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
}));
vi.mock('@/server/domains/articles/repositories/articleTranslationRepo', () => ({
  getTranslationSessionByArticleId: (...args: unknown[]) =>
    getTranslationSessionByArticleIdMock(...args),
  listTranslationEventsAfter: (...args: unknown[]) => listTranslationEventsAfterMock(...args),
}));

describe('ai-translate stream route', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    getArticleByIdMock.mockReset();
    getTranslationSessionByArticleIdMock.mockReset();
    listTranslationEventsAfterMock.mockReset();
  });

  it('SSE stream replays events after Last-Event-ID', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: '2001',
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
    listTranslationEventsAfterMock.mockResolvedValue([
      {
        eventId: 6,
        sessionId: 'session-id-1',
        segmentIndex: 1,
        eventType: 'segment.succeeded',
        payload: { segmentIndex: 1, translatedText: '你好' },
        createdAt: '2026-03-04T00:00:01.000Z',
      },
    ]);

    const mod = await import('../../../../../../../app/api/articles/[id]/ai-translate/stream/route');
    const abortController = new AbortController();
    const res = await mod.GET(
      new Request(`http://localhost/api/articles/${articleId}/ai-translate/stream`, {
        headers: { 'last-event-id': '5' },
        signal: abortController.signal,
      }),
      { params: Promise.resolve({ id: articleId }) },
    );

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body?.getReader();
    expect(reader).toBeTruthy();
    const firstChunk = await reader!.read();
    const text = new TextDecoder().decode(firstChunk.value ?? new Uint8Array());

    expect(text).toContain('id: 6');
    expect(text).toContain('event: segment.succeeded');
    expect(text).toContain('"segmentIndex":1');

    await reader!.cancel();
    abortController.abort();
  });
  it('serializes slow polls, skips repeated IDs and closes after the terminal event', async () => {
    vi.useFakeTimers();
    getArticleByIdMock.mockResolvedValue({ id: articleId });
    getTranslationSessionByArticleIdMock.mockResolvedValue({ id: 'session-1', userId: '1', status: 'running' });
    let resolvePoll!: (events: unknown[]) => void;
    listTranslationEventsAfterMock.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => {
      resolvePoll = resolve;
    })).mockResolvedValue([]);
    const { GET } = await import('@/app/api/articles/[id]/ai-translate/stream/route');
    const response = await GET(new Request('http://localhost/stream'), {
      params: Promise.resolve({ id: articleId }),
    });
    const reader = response.body!.getReader();
    try {
      const firstRead = reader.read();
      await vi.advanceTimersByTimeAsync(1000 * 4);
      // 查询超过多个轮询周期时，必须仍然只有一个未完成的数据库请求。
      expect(listTranslationEventsAfterMock).toHaveBeenCalledTimes(2);
      resolvePoll([
        { eventId: 2, eventType: 'segment.succeeded', payload: { deltaText: '你好' } },
        { eventId: 2, eventType: 'segment.succeeded', payload: { deltaText: '你好' } },
        { eventId: 3, eventType: 'session.completed', payload: {} },
      ]);
      const first = await firstRead;
      expect(new TextDecoder().decode(first.value)).toContain('id: 2');
      const terminal = await reader.read();
      expect(new TextDecoder().decode(terminal.value)).toContain('session.completed');
      expect((await reader.read()).done).toBe(true);
      await vi.advanceTimersByTimeAsync(1000 * 4);
      expect(listTranslationEventsAfterMock).toHaveBeenCalledTimes(2);
      expect(response.headers.get('x-accel-buffering')).toBe('no');
    } finally {
      await reader.cancel();
    }
  });

  it('stops polling when the client does not consume queued events', async () => {
    vi.useFakeTimers();
    getArticleByIdMock.mockResolvedValue({ id: articleId });
    getTranslationSessionByArticleIdMock.mockResolvedValue({ id: 'session-1', userId: '1', status: 'running' });
    listTranslationEventsAfterMock.mockResolvedValue([
      { eventId: 1, eventType: 'segment.succeeded', payload: {} },
      { eventId: 2, eventType: 'segment.succeeded', payload: {} },
    ]);
    const { GET } = await import('@/app/api/articles/[id]/ai-translate/stream/route');
    const response = await GET(new Request('http://localhost/stream'), {
      params: Promise.resolve({ id: articleId }),
    });
    try {
      await vi.advanceTimersByTimeAsync(1000 * 5);
      expect(listTranslationEventsAfterMock).toHaveBeenCalledTimes(1);
    } finally {
      await response.body!.cancel();
    }
  });

});
