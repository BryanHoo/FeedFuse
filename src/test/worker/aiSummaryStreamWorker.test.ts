import { describe, expect, it, vi } from 'vitest';

const challengeSourceUrl =
  'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=test&target_url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc';
const challengeContentHtml =
  '<div><h2>环境异常</h2><p>当前环境异常，完成验证后即可继续访问。</p><p><a>去验证</a></p></div>';

describe('aiSummaryStreamWorker', () => {
  it('skips a worker whose session claim was rejected', async () => {
    const stream = vi.fn();
    const fail = vi.fn();
    const events = vi.fn();
    const mod = await import('@/worker/aiSummaryStreamWorker');
    await mod.runAiSummaryStreamWorker({
      pool: {} as never, userId: '1', articleId: '20', sessionId: '10', jobId: 'old-job',
      deps: {
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        getArticleById: async () => ({ id: '20', userId: '1', feedId: '30', contentHtml: '<p>Body</p>' }) as never,
        getAiSummarySessionById: async () => ({ id: '10', articleId: '20', jobId: 'new-job' }) as never,
        upsertAiSummarySession: vi.fn().mockResolvedValue(null),
        getFeedFullTextOnOpenEnabled: async () => false,
        getAiApiKey: async () => 'test',
        getUiSettings: async () => ({ ai: { model: 'test', apiBaseUrl: 'https://example.com/v1' } }) as never,
        streamSummarizeText: stream,
        failAiSummarySession: fail,
        insertAiSummaryEvent: events,
      },
    });
    expect(stream).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
  });

  it('coalesces tiny fragments without repeatedly storing full snapshots', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);
    const runArticleTaskWithStatusMock = vi.fn(async ({ fn }: { fn: () => Promise<void> }) => fn());

    const getUiSettingsMock = vi.fn().mockResolvedValue({ ai: { model: 'gpt-4o-mini', apiBaseUrl: 'https://ai.example.com/v1' } });
    const mod = await import('../../worker/aiSummaryStreamWorker');

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
            rawErrorMessage: null,
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
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: getUiSettingsMock,
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: runArticleTaskWithStatusMock,
        streamSummarizeText: async function* () {
          yield 'TL;DR';
          for (const character of '\n- 第一条') yield character;
          for (let i = 0; i < 1000; i += 1) yield '。';
        },
        updateAiSummarySessionDraft: updateSessionDraftMock,
        insertAiSummaryEvent: insertEventMock,
        completeAiSummarySession: completeSessionMock,
        failAiSummarySession: failSessionMock,
        setArticleAiSummary: setArticleAiSummaryMock,
      },
    });

    expect(updateSessionDraftMock).toHaveBeenCalled();
    expect(runArticleTaskWithStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userOperation: expect.objectContaining({
          actionKey: 'article.aiSummary.generate',
          source: 'worker/aiSummaryStreamWorker',
        }),
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'summary.delta' }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        finalText: `TL;DR\n- 第一条${'。'.repeat(1000)}`,
      }),
    );
    expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      expect.objectContaining({ aiSummary: `TL;DR\n- 第一条${'。'.repeat(1000)}` }),
    );
    const deltaEvents = insertEventMock.mock.calls.map((call) => call[1]).filter((event) => event.eventType === 'summary.delta');
    expect(deltaEvents.length).toBeLessThanOrEqual(3);
    expect(deltaEvents.map((event) => event.payload.deltaText).join('')).toBe(`TL;DR\n- 第一条${'。'.repeat(1000)}`);
    expect(updateSessionDraftMock.mock.calls.length).toBeLessThanOrEqual(2);
    expect(getUiSettingsMock.mock.calls.length).toBeLessThanOrEqual(4);
    expect(insertEventMock.mock.calls.filter((call) => call[1].eventType === 'summary.snapshot')).toHaveLength(1);
    expect(failSessionMock).not.toHaveBeenCalled();
  });

  it('keeps session userId when resuming an existing non-admin session', async () => {
    const upsertAiSummarySessionMock = vi.fn().mockResolvedValue({
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
      rawErrorMessage: null,
      supersededBySessionId: null,
      startedAt: '2026-03-09T00:00:00.000Z',
      finishedAt: null,
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
    } as never);

    const mod = await import('../../worker/aiSummaryStreamWorker');

    await mod.runAiSummaryStreamWorker({
      pool: {} as never,
      articleId: 'article-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      userId: '2',
      deps: {
        getArticleById: async () =>
          ({
            id: 'article-1',
            userId: '2',
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
            userId: '2',
            articleId: 'article-1',
            sourceTextHash: 'hash-1',
            status: 'queued',
            draftText: '',
            finalText: null,
            model: null,
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getActiveAiSummarySessionByArticleId: async () => null,
        upsertAiSummarySession: upsertAiSummarySessionMock,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: async () =>
          ({
            ai: {
              model: 'gpt-4o-mini',
              apiBaseUrl: 'https://ai.example.com/v1',
            },
          }) as never,
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        streamSummarizeText: async function* () {
          yield 'TL;DR';
        },
        updateAiSummarySessionDraft: vi.fn().mockResolvedValue(undefined),
        insertAiSummaryEvent: vi.fn().mockResolvedValue(undefined),
        completeAiSummarySession: vi.fn().mockResolvedValue(undefined),
        failAiSummarySession: vi.fn().mockResolvedValue(undefined),
        setArticleAiSummary: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(upsertAiSummarySessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: '2',
        sessionId: 'session-1',
      }),
    );
  });

  it('treats stored verification page fulltext as pending when auto fulltext is enabled', async () => {
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
              contentFullHtml: challengeContentHtml,
              contentFullSourceUrl: challengeSourceUrl,
              contentFullError: null,
              summary: null,
              aiSummary: null,
            }) as never,
          getFeedFullTextOnOpenEnabled: async () => true,
          runArticleTaskWithStatus: async ({ fn }) => fn(),
          insertAiSummaryEvent: insertEventMock,
          failAiSummarySession: failSessionMock,
        },
      }),
    ).rejects.toThrow('Fulltext pending');

    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        errorCode: 'fulltext_pending',
        rawErrorMessage: 'Fulltext pending',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'session.failed',
        payload: expect.objectContaining({
          errorCode: 'fulltext_pending',
          rawErrorMessage: 'Fulltext pending',
        }),
      }),
    );
  });

  it('keeps draft and emits session.failed when streaming fails', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
              rawErrorMessage: null,
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
              rawErrorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getAiApiKey: async () => 'sk-test',
          getUiSettings: async () =>
            ({
              ai: {
                model: 'gpt-4o-mini',
                apiBaseUrl: 'https://ai.example.com/v1',
              },
            }) as never,
          getFeedFullTextOnOpenEnabled: async () => false,
          runArticleTaskWithStatus: async ({ fn }) => fn(),
          streamSummarizeText: async function* () {
            yield 'TL;DR';
            yield '\n- 未完成';
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

    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        draftText: 'TL;DR\n- 未完成',
        errorCode: 'ai_rate_limited',
        rawErrorMessage: '429 rate limit',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'session.failed' }),
    );
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(setArticleAiSummaryMock).not.toHaveBeenCalled();
  });

  it('filters think blocks from streamed summary draft and final text', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
            rawErrorMessage: null,
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
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: async () =>
          ({
            ai: {
              model: 'gpt-4o-mini',
              apiBaseUrl: 'https://ai.example.com/v1',
              deepThinkingEnabled: true,
            },
          }) as never,
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        streamSummarizeText: async function* () {
          yield '<think>先分析';
          yield '上下文</think>结论';
          yield '\n- 要点';
        },
        updateAiSummarySessionDraft: updateSessionDraftMock,
        insertAiSummaryEvent: insertEventMock,
        completeAiSummarySession: completeSessionMock,
        failAiSummarySession: vi.fn().mockResolvedValue(undefined),
        setArticleAiSummary: setArticleAiSummaryMock,
      },
    });

    expect(updateSessionDraftMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        draftText: '结论\n- 要点',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'summary.delta',
        payload: { deltaText: '结论' },
      }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        finalText: '结论\n- 要点',
      }),
    );
    expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      expect.objectContaining({
        aiSummary: '结论\n- 要点',
      }),
    );
  });

  it('skips reasoning-only deltas before persisting visible summary text', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
            rawErrorMessage: null,
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
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: async () =>
          ({
            ai: {
              model: 'deepseek-v4-pro',
              apiBaseUrl: 'https://api.deepseek.com',
              deepThinkingEnabled: true,
            },
          }) as never,
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        streamSummarizeText: async function* () {
          yield '';
          yield '最终';
          yield '答案';
        },
        updateAiSummarySessionDraft: updateSessionDraftMock,
        insertAiSummaryEvent: insertEventMock,
        completeAiSummarySession: completeSessionMock,
        failAiSummarySession: vi.fn().mockResolvedValue(undefined),
        setArticleAiSummary: setArticleAiSummaryMock,
      },
    });

    expect(insertEventMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'summary.delta',
        payload: { deltaText: '' },
      }),
    );
    expect(updateSessionDraftMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        draftText: '最终答案',
      }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        finalText: '最终答案',
      }),
    );
    expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      expect.objectContaining({
        aiSummary: '最终答案',
      }),
    );
  });

  it('preserves previously persisted draft text when deep thinking stream resumes', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
            draftText: '前半段',
            finalText: null,
            model: null,
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: null,
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
            draftText: '前半段',
            finalText: null,
            model: null,
            jobId: 'job-1',
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: null,
            supersededBySessionId: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            createdAt: '2026-03-09T00:00:00.000Z',
            updatedAt: '2026-03-09T00:00:00.000Z',
          }) as never,
        getAiApiKey: async () => 'sk-test',
        getUiSettings: async () =>
          ({
            ai: {
              model: 'deepseek-v4-pro',
              apiBaseUrl: 'https://api.deepseek.com',
              deepThinkingEnabled: true,
            },
          }) as never,
        getFeedFullTextOnOpenEnabled: async () => false,
        runArticleTaskWithStatus: async ({ fn }) => fn(),
        streamSummarizeText: async function* () {
          // 模拟恢复后的流只返回剩余尾部。
          yield '后半段';
        },
        updateAiSummarySessionDraft: updateSessionDraftMock,
        insertAiSummaryEvent: vi.fn().mockResolvedValue(undefined),
        completeAiSummarySession: completeSessionMock,
        failAiSummarySession: vi.fn().mockResolvedValue(undefined),
        setArticleAiSummary: setArticleAiSummaryMock,
      },
    });

    expect(updateSessionDraftMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        draftText: '前半段后半段',
      }),
    );
    expect(completeSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        finalText: '前半段后半段',
      }),
    );
    expect(setArticleAiSummaryMock).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      expect.objectContaining({
        aiSummary: '前半段后半段',
      }),
    );
  });

  it('emits session.failed when pre-stream setup fails before streaming starts', async () => {
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
              rawErrorMessage: null,
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
              rawErrorMessage: null,
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
        rawErrorMessage: 'Missing AI API key',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'session.failed',
        payload: expect.objectContaining({
          sessionId: 'session-1',
          errorCode: 'ai_invalid_config',
          rawErrorMessage: 'Missing AI API key',
        }),
      }),
    );
  });

  it('emits session.failed when shared AI config is incomplete before streaming starts', async () => {
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);

    const mod = await import('../../worker/aiSummaryStreamWorker');

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
              rawErrorMessage: null,
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
              rawErrorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getAiApiKey: async () => 'sk-test',
          getUiSettings: async () =>
            ({
              ai: {
                model: '',
                apiBaseUrl: '',
              },
            }) as never,
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
    ).rejects.toThrow('Missing AI configuration');

    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        errorCode: 'ai_invalid_config',
        rawErrorMessage: 'Missing AI configuration',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'session.failed',
        payload: expect.objectContaining({
          sessionId: 'session-1',
          errorCode: 'ai_invalid_config',
          rawErrorMessage: 'Missing AI configuration',
        }),
      }),
    );
  });

  it('fails the session without writing new summary content when shared AI config changes mid-stream', async () => {
    const updateSessionDraftMock = vi.fn().mockResolvedValue(undefined);
    const insertEventMock = vi.fn().mockResolvedValue(undefined);
    const completeSessionMock = vi.fn().mockResolvedValue(undefined);
    const failSessionMock = vi.fn().mockResolvedValue(undefined);
    const setArticleAiSummaryMock = vi.fn().mockResolvedValue(undefined);
    const getUiSettingsMock = vi
      .fn()
      .mockResolvedValueOnce({
        ai: {
          model: 'gpt-4o-mini',
          apiBaseUrl: 'https://ai.example.com/v1',
        },
      })
      .mockResolvedValueOnce({
        ai: {
          model: 'gpt-4o-mini',
          apiBaseUrl: 'https://ai.example.com/v2',
        },
      });
    const getAiApiKeyMock = vi.fn().mockResolvedValue('sk-test');

    const mod = await import('../../worker/aiSummaryStreamWorker');

    await expect(
      mod.runAiSummaryStreamWorker({
        pool: {} as never,
        articleId: 'article-1',
        sessionId: 'session-1',
        jobId: 'job-1',
        sharedConfigFingerprint: 'fingerprint-old',
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
              rawErrorMessage: null,
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
              draftText: '已有草稿',
              finalText: null,
              model: null,
              jobId: 'job-1',
              errorCode: null,
              errorMessage: null,
              rawErrorMessage: null,
              supersededBySessionId: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              createdAt: '2026-03-09T00:00:00.000Z',
              updatedAt: '2026-03-09T00:00:00.000Z',
            }) as never,
          getAiApiKey: getAiApiKeyMock,
          getUiSettings: getUiSettingsMock,
          getFeedFullTextOnOpenEnabled: async () => false,
          runArticleTaskWithStatus: async ({ fn }) => fn(),
          streamSummarizeText: async function* () {
            yield '新内容';
          },
          updateAiSummarySessionDraft: updateSessionDraftMock,
          insertAiSummaryEvent: insertEventMock,
          completeAiSummarySession: completeSessionMock,
          failAiSummarySession: failSessionMock,
          setArticleAiSummary: setArticleAiSummaryMock,
        },
      }),
    ).rejects.toThrow('AI configuration changed');

    expect(updateSessionDraftMock).not.toHaveBeenCalled();
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(setArticleAiSummaryMock).not.toHaveBeenCalled();
    expect(failSessionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sessionId: 'session-1',
        draftText: '已有草稿',
        errorCode: 'ai_config_changed',
      }),
    );
    expect(insertEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ eventType: 'session.failed' }),
    );
  });
});
