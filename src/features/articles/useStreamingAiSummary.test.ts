import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StreamingAiSummaryApi } from './useStreamingAiSummary';
import { useStreamingAiSummary } from './useStreamingAiSummary';

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
});
