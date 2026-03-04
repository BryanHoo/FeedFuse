import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ImmersiveTranslationApi } from './useImmersiveTranslation';
import { useImmersiveTranslation } from './useImmersiveTranslation';

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

function HookHarness(input: { articleId: string; api: ImmersiveTranslationApi }) {
  const immersive = useImmersiveTranslation({ articleId: input.articleId, api: input.api });

  return React.createElement(
    'div',
    null,
    React.createElement(
      'button',
      { type: 'button', onClick: () => void immersive.requestTranslation() },
      'start',
    ),
    React.createElement(
      'button',
      { type: 'button', onClick: () => void immersive.retrySegment(1) },
      'retry',
    ),
    React.createElement(
      'div',
      { 'data-testid': 'segments' },
      immersive.segments
        .map((segment) => `${segment.segmentIndex}:${segment.status}:${segment.translatedText ?? '-'}`)
        .join('|'),
    ),
  );
}

describe('useImmersiveTranslation', () => {
  it('keeps segment order stable when events arrive out of order', async () => {
    const fakeEventSource = new FakeEventSource();
    const api: ImmersiveTranslationApi = {
      enqueueArticleAiTranslate: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-1',
        sessionId: 'session-1',
      }),
      getArticleAiTranslateSnapshot: vi.fn().mockResolvedValue({
        session: {
          id: 'session-1',
          articleId: 'article-1',
          sourceHtmlHash: 'hash-1',
          status: 'running',
          totalSegments: 2,
          translatedSegments: 0,
          failedSegments: 0,
          startedAt: '2026-03-04T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-04T00:00:00.000Z',
        },
        segments: [
          {
            id: 'seg-0',
            segmentIndex: 0,
            sourceText: 'A',
            translatedText: null,
            status: 'pending',
            errorCode: null,
            errorMessage: null,
            updatedAt: '2026-03-04T00:00:00.000Z',
          },
          {
            id: 'seg-1',
            segmentIndex: 1,
            sourceText: 'B',
            translatedText: null,
            status: 'pending',
            errorCode: null,
            errorMessage: null,
            updatedAt: '2026-03-04T00:00:00.000Z',
          },
        ],
      }),
      retryArticleAiTranslateSegment: vi.fn().mockResolvedValue({
        enqueued: true,
        jobId: 'job-retry-1',
      }),
      createArticleAiTranslateEventSource: vi
        .fn()
        .mockReturnValue(fakeEventSource as unknown as EventSource),
    };

    render(React.createElement(HookHarness, { articleId: 'article-1', api }));
    fireEvent.click(screen.getByRole('button', { name: 'start' }));

    await waitFor(() => {
      expect(screen.getByTestId('segments').textContent).toBe('0:pending:-|1:pending:-');
    });

    await act(async () => {
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 1,
        status: 'succeeded',
        translatedText: '乙',
      });
      fakeEventSource.emit('segment.succeeded', {
        segmentIndex: 0,
        status: 'succeeded',
        translatedText: '甲',
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId('segments').textContent).toBe('0:succeeded:甲|1:succeeded:乙');
    });
  });

  it('retries failed segment and refreshes snapshot state', async () => {
    const fakeEventSource = new FakeEventSource();
    const getSnapshot = vi
      .fn()
      .mockResolvedValueOnce({
        session: {
          id: 'session-1',
          articleId: 'article-1',
          sourceHtmlHash: 'hash-1',
          status: 'partial_failed',
          totalSegments: 2,
          translatedSegments: 1,
          failedSegments: 1,
          startedAt: '2026-03-04T00:00:00.000Z',
          finishedAt: '2026-03-04T00:01:00.000Z',
          updatedAt: '2026-03-04T00:01:00.000Z',
        },
        segments: [
          {
            id: 'seg-0',
            segmentIndex: 0,
            sourceText: 'A',
            translatedText: '甲',
            status: 'succeeded',
            errorCode: null,
            errorMessage: null,
            updatedAt: '2026-03-04T00:00:30.000Z',
          },
          {
            id: 'seg-1',
            segmentIndex: 1,
            sourceText: 'B',
            translatedText: null,
            status: 'failed',
            errorCode: 'ai_timeout',
            errorMessage: '请求超时',
            updatedAt: '2026-03-04T00:00:30.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        session: {
          id: 'session-1',
          articleId: 'article-1',
          sourceHtmlHash: 'hash-1',
          status: 'running',
          totalSegments: 2,
          translatedSegments: 1,
          failedSegments: 0,
          startedAt: '2026-03-04T00:00:00.000Z',
          finishedAt: null,
          updatedAt: '2026-03-04T00:02:00.000Z',
        },
        segments: [
          {
            id: 'seg-0',
            segmentIndex: 0,
            sourceText: 'A',
            translatedText: '甲',
            status: 'succeeded',
            errorCode: null,
            errorMessage: null,
            updatedAt: '2026-03-04T00:00:30.000Z',
          },
          {
            id: 'seg-1',
            segmentIndex: 1,
            sourceText: 'B',
            translatedText: null,
            status: 'pending',
            errorCode: null,
            errorMessage: null,
            updatedAt: '2026-03-04T00:02:00.000Z',
          },
        ],
      });

    const retrySegment = vi.fn().mockResolvedValue({
      enqueued: true,
      jobId: 'job-retry-1',
    });

    const api: ImmersiveTranslationApi = {
      enqueueArticleAiTranslate: vi.fn().mockResolvedValue({
        enqueued: false,
        reason: 'already_enqueued',
        sessionId: 'session-1',
      }),
      getArticleAiTranslateSnapshot: getSnapshot,
      retryArticleAiTranslateSegment: retrySegment,
      createArticleAiTranslateEventSource: vi
        .fn()
        .mockReturnValue(fakeEventSource as unknown as EventSource),
    };

    render(React.createElement(HookHarness, { articleId: 'article-1', api }));
    fireEvent.click(screen.getByRole('button', { name: 'start' }));

    await waitFor(() => {
      expect(screen.getByTestId('segments').textContent).toBe('0:succeeded:甲|1:failed:-');
    });

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));

    await waitFor(() => {
      expect(retrySegment).toHaveBeenCalledWith('article-1', 1);
    });
    await waitFor(() => {
      expect(screen.getByTestId('segments').textContent).toBe('0:succeeded:甲|1:pending:-');
    });
  });
});
