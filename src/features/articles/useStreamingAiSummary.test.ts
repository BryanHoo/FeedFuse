import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamingAiSummaryApi } from './useStreamingAiSummary';
import { useStreamingAiSummary } from './useStreamingAiSummary';

const {
  beginDeferredOperationMock,
  resolveDeferredOperationMock,
  failDeferredOperationMock,
} = vi.hoisted(() => ({
  beginDeferredOperationMock: vi.fn(),
  resolveDeferredOperationMock: vi.fn(),
  failDeferredOperationMock: vi.fn(),
}));

vi.mock('../notifications/userOperationNotifier', () => ({
  beginDeferredOperation: (...args: unknown[]) => beginDeferredOperationMock(...args),
  resolveDeferredOperation: (...args: unknown[]) => resolveDeferredOperationMock(...args),
  failDeferredOperation: (...args: unknown[]) => failDeferredOperationMock(...args),
}));

class FakeEventSource {
  private listeners = new Map<string, Set<(event: Event) => void>>();

  close = vi.fn();

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn =
      typeof listener === 'function'
        ? (listener as (event: Event) => void)
        : (event: Event) => listener.handleEvent(event);
    const set = this.listeners.get(type) ?? new Set<(event: Event) => void>();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const fn =
      typeof listener === 'function'
        ? (listener as (event: Event) => void)
        : (event: Event) => listener.handleEvent(event);
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) {
      this.listeners.delete(type);
    }
  }

  emit(eventType: string, payload: Record<string, unknown>) {
    const event = new MessageEvent(eventType, {
      data: JSON.stringify(payload),
      lastEventId: '1',
    });
    for (const listener of this.listeners.get(eventType) ?? []) {
      listener(event);
    }
  }
}

describe('useStreamingAiSummary', () => {
  beforeEach(() => {
    beginDeferredOperationMock.mockReset();
    resolveDeferredOperationMock.mockReset();
    failDeferredOperationMock.mockReset();
  });

  it('loads summary snapshot and applies SSE delta events', async () => {
    const fakeEventSource = new FakeEventSource();
    const onCompleted = vi.fn();
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-1',
        sessionId: 'session-1',
      }),
      getArticleAiSummarySnapshot: vi.fn().mockResolvedValue({
        session: {
          id: 'session-1',
          status: 'running',
          draftText: 'TL;DR',
          finalText: null,
          errorCode: null,
          errorMessage: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-09T00:00:00.000Z',
        },
      }),
      createArticleAiSummaryEventSource: vi
        .fn()
        .mockReturnValue(fakeEventSource as unknown as EventSource),
    };

    const { result } = renderHook(() =>
      useStreamingAiSummary({ articleId: 'article-1', api, onCompleted }),
    );

    await act(async () => {
      await result.current.requestSummary();
    });

    expect(api.getArticleAiSummarySnapshot).toHaveBeenCalledWith('article-1');
    expect(api.createArticleAiSummaryEventSource).toHaveBeenCalledWith('article-1');
    await waitFor(() => {
      expect(result.current.session?.draftText).toBe('TL;DR');
    });

    await act(async () => {
      fakeEventSource.emit('summary.delta', { deltaText: '\n- 第一条' });
    });
    expect(result.current.session?.draftText).toBe('TL;DR\n- 第一条');

    await act(async () => {
      fakeEventSource.emit('summary.snapshot', { draftText: 'TL;DR\n- 第一条\n- 第二条' });
    });
    expect(result.current.session?.draftText).toBe('TL;DR\n- 第一条\n- 第二条');

    await act(async () => {
      fakeEventSource.emit('session.completed', { finalText: 'TL;DR\n- 第一条\n- 第二条' });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.session?.status).toBe('succeeded');
    expect(result.current.session?.finalText).toBe('TL;DR\n- 第一条\n- 第二条');
    expect(fakeEventSource.close).toHaveBeenCalled();
    expect(onCompleted).toHaveBeenCalledWith('article-1');
  });

  it('treats already_enqueued summary as deferred started and resolves on session.completed', async () => {
    const fakeEventSource = new FakeEventSource();
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: false,
        reason: 'already_enqueued',
        sessionId: 'session-1',
      }),
      getArticleAiSummarySnapshot: vi.fn().mockResolvedValue({
        session: {
          id: 'session-1',
          status: 'running',
          draftText: '',
          finalText: null,
          errorCode: null,
          errorMessage: null,
          rawErrorMessage: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-09T00:00:00.000Z',
        },
      }),
      createArticleAiSummaryEventSource: vi
        .fn()
        .mockReturnValue(fakeEventSource as unknown as EventSource),
    };

    const { result } = renderHook(() =>
      useStreamingAiSummary({ articleId: 'article-1', api }),
    );

    await act(async () => {
      await result.current.requestSummary();
    });

    expect(beginDeferredOperationMock).toHaveBeenCalledWith({
      actionKey: 'article.aiSummary.generate',
      trackingKey: 'session-1',
    });

    await act(async () => {
      fakeEventSource.emit('session.completed', { finalText: '摘要完成' });
    });

    expect(resolveDeferredOperationMock).toHaveBeenCalledWith({
      actionKey: 'article.aiSummary.generate',
      trackingKey: 'session-1',
    });
  });

  it('closes old EventSource when articleId changes or unmounts', async () => {
    const firstEventSource = new FakeEventSource();
    const secondEventSource = new FakeEventSource();
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-1',
        sessionId: 'session-1',
      }),
      getArticleAiSummarySnapshot: vi
        .fn()
        .mockResolvedValueOnce({
          session: {
            id: 'session-1',
            status: 'running',
            draftText: 'TL;DR',
            finalText: null,
            errorCode: null,
            errorMessage: null,
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            updatedAt: '2026-03-09T00:00:00.000Z',
          },
        })
        .mockResolvedValueOnce({
          session: {
            id: 'session-2',
            status: 'running',
            draftText: '摘要 2',
            finalText: null,
            errorCode: null,
            errorMessage: null,
            startedAt: '2026-03-09T00:01:00.000Z',
            finishedAt: null,
            updatedAt: '2026-03-09T00:01:00.000Z',
          },
        }),
      createArticleAiSummaryEventSource: vi
        .fn()
        .mockReturnValueOnce(firstEventSource as unknown as EventSource)
        .mockReturnValueOnce(secondEventSource as unknown as EventSource),
    };

    const { result, rerender, unmount } = renderHook(
      ({ articleId }) => useStreamingAiSummary({ articleId, api }),
      { initialProps: { articleId: 'article-1' } },
    );

    await act(async () => {
      await result.current.requestSummary();
    });
    const closeCallsBeforeRerender = firstEventSource.close.mock.calls.length;

    rerender({ articleId: 'article-2' });

    await act(async () => {
      await result.current.requestSummary();
    });
    expect(firstEventSource.close.mock.calls.length).toBeGreaterThan(closeCallsBeforeRerender);

    unmount();
    expect(secondEventSource.close).toHaveBeenCalled();
  });

  it('preserves draft text for each article when switching away and back', async () => {
    const articleOneStream = new FakeEventSource();
    const articleTwoStream = new FakeEventSource();
    const reconnectArticleOneStream = new FakeEventSource();
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-1',
        sessionId: 'session-1',
      }),
      getArticleAiSummarySnapshot: vi.fn().mockImplementation(async (articleId: string) => {
        if (articleId === 'article-1') {
          return {
            session: {
              id: 'session-1',
              status: 'running',
              draftText: 'TL;DR',
              finalText: null,
              errorCode: null,
              errorMessage: null,
              startedAt: '2026-03-09T00:00:00.000Z',
              finishedAt: null,
              updatedAt: '2026-03-09T00:00:00.000Z',
            },
          };
        }

        return {
          session: {
            id: 'session-2',
            status: 'running',
            draftText: '摘要 2',
            finalText: null,
            errorCode: null,
            errorMessage: null,
            startedAt: '2026-03-09T00:01:00.000Z',
            finishedAt: null,
            updatedAt: '2026-03-09T00:01:00.000Z',
          },
        };
      }),
      createArticleAiSummaryEventSource: vi
        .fn()
        .mockReturnValueOnce(articleOneStream as unknown as EventSource)
        .mockReturnValueOnce(articleTwoStream as unknown as EventSource)
        .mockReturnValueOnce(reconnectArticleOneStream as unknown as EventSource),
    };

    const { result, rerender } = renderHook(
      ({ articleId }) => useStreamingAiSummary({ articleId, api }),
      { initialProps: { articleId: 'article-1' } },
    );

    await act(async () => {
      await result.current.requestSummary();
    });

    await act(async () => {
      articleOneStream.emit('summary.delta', { deltaText: '\n- 第一条' });
    });

    expect(result.current.session?.draftText).toBe('TL;DR\n- 第一条');

    rerender({ articleId: 'article-2' });

    await act(async () => {
      await result.current.requestSummary();
    });

    await waitFor(() => {
      expect(result.current.session?.draftText).toBe('摘要 2');
    });

    rerender({ articleId: 'article-1' });

    await waitFor(() => {
      expect(result.current.session?.draftText).toBe('TL;DR\n- 第一条');
    });

    await waitFor(() => {
      expect(api.createArticleAiSummaryEventSource).toHaveBeenNthCalledWith(3, 'article-1');
    });
  });

  it('keeps raw error message from session.failed events', async () => {
    const fakeEventSource = new FakeEventSource();
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-1',
        sessionId: 'session-1',
      }),
      getArticleAiSummarySnapshot: vi.fn().mockResolvedValue({
        session: {
          id: 'session-1',
          status: 'running',
          draftText: 'TL;DR',
          finalText: null,
          errorCode: null,
          errorMessage: null,
          rawErrorMessage: null,
          startedAt: '2026-03-09T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-09T00:00:00.000Z',
        },
      }),
      createArticleAiSummaryEventSource: vi
        .fn()
        .mockReturnValue(fakeEventSource as unknown as EventSource),
    };

    const { result } = renderHook(() =>
      useStreamingAiSummary({ articleId: 'article-1', api }),
    );

    await act(async () => {
      await result.current.requestSummary();
    });

    await act(async () => {
      fakeEventSource.emit('session.failed', {
        errorCode: 'ai_rate_limited',
        errorMessage: '请求太频繁了，请稍后重试',
        rawErrorMessage: '429 rate limit',
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.session?.status).toBe('failed');
    expect(result.current.session?.rawErrorMessage).toBe('429 rate limit');
    expect(result.current.session?.errorMessage).toBe('请求太频繁了，请稍后重试');
  });

  it('marks missingApiKey when enqueue returns missing_ai_config', async () => {
    const api: StreamingAiSummaryApi = {
      enqueueArticleAiSummary: vi.fn().mockResolvedValue({
        enqueued: false,
        reason: 'missing_ai_config',
      }),
      getArticleAiSummarySnapshot: vi.fn(),
      createArticleAiSummaryEventSource: vi.fn(),
    };

    const { result } = renderHook(() =>
      useStreamingAiSummary({ articleId: 'article-1', api }),
    );

    await act(async () => {
      await result.current.requestSummary();
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.missingApiKey).toBe(true);
    expect(api.getArticleAiSummarySnapshot).not.toHaveBeenCalled();
  });

  it('marks session failed when stream has no terminal events for a long time', async () => {
    vi.useFakeTimers();
    try {
      const fakeEventSource = new FakeEventSource();
      const api: StreamingAiSummaryApi = {
        enqueueArticleAiSummary: vi.fn().mockResolvedValue({
          enqueued: true,
          jobId: 'job-1',
          sessionId: 'session-1',
        }),
        getArticleAiSummarySnapshot: vi.fn().mockResolvedValue({
          session: {
            id: 'session-1',
            status: 'running',
            draftText: 'TL;DR',
            finalText: null,
            errorCode: null,
            errorMessage: null,
            rawErrorMessage: 'upstream 429 rate limit',
            startedAt: '2026-03-09T00:00:00.000Z',
            finishedAt: null,
            updatedAt: '2026-03-09T00:00:00.000Z',
          },
        }),
        createArticleAiSummaryEventSource: vi
          .fn()
          .mockReturnValue(fakeEventSource as unknown as EventSource),
      };

      const { result } = renderHook(() =>
        useStreamingAiSummary({ articleId: 'article-1', api }),
      );

      await act(async () => {
        await result.current.requestSummary();
      });

      expect(result.current.loading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.session?.status).toBe('failed');
      expect(result.current.session?.errorCode).toBe('ai_timeout');
      expect(result.current.session?.rawErrorMessage).toBe('upstream 429 rate limit');
      expect(fakeEventSource.close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
