import { describe, expect, it, vi } from 'vitest';

describe('aiSummaryStreamWorker', () => {
  it('persists draft updates and finalizes article ai summary on completion', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('./aiSummaryStreamWorker');

    await mod.runAiSummaryStreamWorker({
      pool: {} as never,
      articleId: 'article-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      deps: {
        getArticleById: async () =>
          ({
            id: 'article-1',
            feedId: 'feed-1',
            contentHtml: '<p>hello</p>',
            contentFullHtml: null,
            contentFullError: null,
            summary: null,
            aiSummary: null,
          }) as never,
        getAiSummarySessionById: async () =>
          ({
            id: 'session-1',
            articleId: 'article-1',
            sourceTextHash: 'hash-1',
            status: 'queued',
            draftText: '',
            finalText: null,
            model: null,
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getActiveAiSummarySessionByArticleId: async () => null,
        upsertAiSummarySession: async () =>
          ({
            id: 'session-1',
            articleId: 'article-1',
            sourceTextHash: 'hash-1',
            status: 'running',
            draftText: '',
            finalText: null,
            model: null,
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: async () => ({} as never),
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        streamSummarizeText: async function* () {
          yield 'TL;DR';
          yield '\n- 第一条';
        },
        updateAiSummarySessionDraft: updateSessionDraftMock,
        insertAiSummaryEvent: insertEventMock,
        completeAiSummarySession: completeSessionMock,
        failAiSummarySession: failSessionMock,
        setArticleAiSummary: setArticleAiSummaryMock,
      },
    });

    expect(updateSessionDraftMock).toHaveBeenCalled();
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'summary.delta' }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        finalText: 'TL;DR\n- 第一条',
      }),
    );
    expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      expect.objectContaining({ aiSummary: 'TL;DR\n- 第一条' }),
    );
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it('keeps draft and emits session.failed when streaming fails', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('./aiSummaryStreamWorker');

    await expect(
      mod.runAiSummaryStreamWorker({
        pool: {} as never,
        articleId: 'article-1',
        sessionId: 'session-1',
        jobId: 'job-1',
        deps: {
          getArticleById: async () =>
            ({
              id: 'article-1',
              feedId: 'feed-1',
              contentHtml: '<p>hello</p>',
              contentFullHtml: null,
              contentFullError: null,
              summary: null,
              aiSummary: null,
            }) as never,
          getAiSummarySessionById: async () =>
            ({
              id: 'session-1',
              articleId: 'article-1',
              sourceTextHash: 'hash-1',
              status: 'queued',
              draftText: '',
              finalText: null,
              model: null,
              jobId: 'job-1',
              errorCode: null,
              errorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getActiveAiSummarySessionByArticleId: async () => null,
          upsertAiSummarySession: async () =>
            ({
              id: 'session-1',
              articleId: 'article-1',
              sourceTextHash: 'hash-1',
              status: 'running',
              draftText: '',
              finalText: null,
              model: null,
              jobId: 'job-1',
              errorCode: null,
              errorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getAiApiKey: async () => 'sk-test',
          getUiSettings: async () => ({} as never),
          getFeedFullTextOnOpenEnabled: async () => false,
          runArticleTaskWithStatus: async ({ fn }) => fn(),
          streamSummarizeText: async function* () {
            yield 'TL;DR';
            throw new Error('429 rate limit');
          },
          updateAiSummarySessionDraft: updateSessionDraftMock,
          insertAiSummaryEvent: insertEventMock,
          completeAiSummarySession: completeSessionMock,
          failAiSummarySession: failSessionMock,
          setArticleAiSummary: setArticleAiSummaryMock,
        },
      }),
    ).rejects.toThrow('429 rate limit');

    expect(updateSessionDraftMock).toHaveBeenCalled();
    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        draftText: 'TL;DR',
        errorCode: 'ai_rate_limited',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'session.failed' }),
    );
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(setArticleAiSummaryMock).not.toHaveBeenCalled();
  });

  it('emits session.failed when pre-stream setup fails before streaming starts', async () => {
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('./aiSummaryStreamWorker');

    await expect(
      mod.runAiSummaryStreamWorker({
        pool: {} as never,
        articleId: 'article-1',
        sessionId: 'session-1',
        jobId: 'job-1',
        deps: {
          getArticleById: async () =>
            ({
              id: 'article-1',
              feedId: 'feed-1',
              contentHtml: '<p>hello</p>',
              contentFullHtml: null,
              contentFullError: null,
              summary: null,
              aiSummary: null,
            }) as never,
          getAiSummarySessionById: async () =>
            ({
              id: 'session-1',
              articleId: 'article-1',
              sourceTextHash: 'hash-1',
              status: 'queued',
              draftText: '已有草稿',
              finalText: null,
              model: null,
              jobId: 'job-1',
              errorCode: null,
              errorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getActiveAiSummarySessionByArticleId: async () => null,
          upsertAiSummarySession: async () =>
            ({
              id: 'session-1',
              articleId: 'article-1',
              sourceTextHash: 'hash-1',
              status: 'queued',
              draftText: '已有草稿',
              finalText: null,
              model: null,
              jobId: 'job-1',
              errorCode: null,
              errorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getAiApiKey: async () => '',
          getUiSettings: async () => ({} as never),
          getFeedFullTextOnOpenEnabled: async () => false,
          runArticleTaskWithStatus: async ({ fn }) => fn(),
          streamSummarizeText: async function* () {
            yield '不会执行';
          },
          updateAiSummarySessionDraft: vi.fn().mockResolvedValue(undefined),
          insertAiSummaryEvent: insertEventMock,
          completeAiSummarySession: vi.fn().mockResolvedValue(undefined),
          failAiSummarySession: failSessionMock,
          setArticleAiSummary: vi.fn().mockResolvedValue(undefined),
        },
      }),
    ).rejects.toThrow('Missing AI API key');

    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        errorCode: 'ai_invalid_config',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'session.failed',
        payload: expect.objectContaining({
          sessionId: 'session-1',
          errorCode: 'ai_invalid_config',
        }),
      }),
    );
  });
});
