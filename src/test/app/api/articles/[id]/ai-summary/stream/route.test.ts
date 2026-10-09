import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const articleId = '3001';

const getArticleByIdMock = vi.fn();
const getActiveAiSummarySessionByArticleIdMock = vi.fn();
const listAiSummaryEventsAfterMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
}));
vi.mock('@/server/domains/articles/repositories/articleAiSummaryRepo', () => ({
  getActiveAiSummarySessionByArticleId: (...args: unknown[]) =>
    getActiveAiSummarySessionByArticleIdMock(...args),
  listAiSummaryEventsAfter: (...args: unknown[]) => listAiSummaryEventsAfterMock(...args),
}));

describe('ai-summary stream route', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.useRealTimers();
    getArticleByIdMock.mockReset();
    getActiveAiSummarySessionByArticleIdMock.mockReset();
    listAiSummaryEventsAfterMock.mockReset();
  });

  it('SSE stream replays summary events after Last-Event-ID', async () => {
    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: '2001',
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
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
    listAiSummaryEventsAfterMock.mockResolvedValue([
      {
        eventId: 8,
        sessionId: 'summary-session-id-1',
        eventType: 'summary.delta',
        payload: { deltaText: ' 第一条' },
        createdAt: '2026-03-09T00:00:11.000Z',
      },
    ]);

    const mod = await import('../../../../../../../app/api/articles/[id]/ai-summary/stream/route');
    const abortController = new AbortController();
    const res = await mod.GET(
      new Request(`http://localhost/api/articles/${articleId}/ai-summary/stream`, {
        headers: { 'last-event-id': '7' },
        signal: abortController.signal,
      }),
      { params: Promise.resolve({ id: articleId }) },
    );

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body?.getReader();
    expect(reader).toBeTruthy();
    const firstChunk = await reader!.read();
    const text = new TextDecoder().decode(firstChunk.value ?? new Uint8Array());

    expect(text).toContain('id: 8');
    expect(text).toContain('event: summary.delta');
    expect(text).toContain('"deltaText":" 第一条"');

    await reader!.cancel();
    abortController.abort();
  });

  it('replays follow-up events within the short poll window', async () => {
    vi.useFakeTimers();

    getArticleByIdMock.mockResolvedValue({
      id: articleId,
      feedId: '2001',
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
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:10.000Z',
    });
    listAiSummaryEventsAfterMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          eventId: 9,
          sessionId: 'summary-session-id-1',
          eventType: 'summary.delta',
          payload: { deltaText: ' 第二条' },
          createdAt: '2026-03-11T00:00:01.000Z',
        },
      ]);

    const mod = await import('../../../../../../../app/api/articles/[id]/ai-summary/stream/route');
    const abortController = new AbortController();
    const res = await mod.GET(
      new Request(`http://localhost/api/articles/${articleId}/ai-summary/stream`, {
        signal: abortController.signal,
      }),
      { params: Promise.resolve({ id: articleId }) },
    );

    const reader = res.body!.getReader();
    let text: string | null = null;
    const pendingRead = reader.read().then((chunk) => {
      text = new TextDecoder().decode(chunk.value ?? new Uint8Array());
      return chunk;
    });

    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    expect(text).toContain('event: summary.delta');

    await reader.cancel();
    abortController.abort();
    await pendingRead;
  });
  it('serializes slow polls, skips repeated IDs and closes after the terminal event', async () => {
    vi.useFakeTimers();
    getArticleByIdMock.mockResolvedValue({ id: articleId });
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({ id: 'session-1', userId: '1', status: 'running' });
    let resolvePoll!: (events: unknown[]) => void;
    listAiSummaryEventsAfterMock.mockResolvedValueOnce([]).mockImplementationOnce(() => new Promise((resolve) => {
      resolvePoll = resolve;
    })).mockResolvedValue([]);
    const { GET } = await import('@/app/api/articles/[id]/ai-summary/stream/route');
    const response = await GET(new Request('http://localhost/stream'), {
      params: Promise.resolve({ id: articleId }),
    });
    const reader = response.body!.getReader();
    try {
      const firstRead = reader.read();
      await vi.advanceTimersByTimeAsync(250 * 4);
      // 查询超过多个轮询周期时，必须仍然只有一个未完成的数据库请求。
      expect(listAiSummaryEventsAfterMock).toHaveBeenCalledTimes(2);
      resolvePoll([
        { eventId: 2, eventType: 'summary.delta', payload: { deltaText: '你好' } },
        { eventId: 2, eventType: 'summary.delta', payload: { deltaText: '你好' } },
        { eventId: 3, eventType: 'session.completed', payload: {} },
      ]);
      const first = await firstRead;
      expect(new TextDecoder().decode(first.value)).toContain('id: 2');
      const terminal = await reader.read();
      expect(new TextDecoder().decode(terminal.value)).toContain('session.completed');
      expect((await reader.read()).done).toBe(true);
      await vi.advanceTimersByTimeAsync(250 * 4);
      expect(listAiSummaryEventsAfterMock).toHaveBeenCalledTimes(2);
      expect(response.headers.get('x-accel-buffering')).toBe('no');
    } finally {
      await reader.cancel();
    }
  });

  it('stops polling when the client does not consume queued events', async () => {
    vi.useFakeTimers();
    getArticleByIdMock.mockResolvedValue({ id: articleId });
    getActiveAiSummarySessionByArticleIdMock.mockResolvedValue({ id: 'session-1', userId: '1', status: 'running' });
    listAiSummaryEventsAfterMock.mockResolvedValue([
      { eventId: 1, eventType: 'summary.delta', payload: {} },
      { eventId: 2, eventType: 'summary.delta', payload: {} },
    ]);
    const { GET } = await import('@/app/api/articles/[id]/ai-summary/stream/route');
    const response = await GET(new Request('http://localhost/stream'), {
      params: Promise.resolve({ id: articleId }),
    });
    try {
      await vi.advanceTimersByTimeAsync(250 * 5);
      expect(listAiSummaryEventsAfterMock).toHaveBeenCalledTimes(1);
    } finally {
      await response.body!.cancel();
    }
  });

});
