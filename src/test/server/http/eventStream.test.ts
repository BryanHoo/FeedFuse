import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEventStream, parseLastEventId } from '@/server/infra/http/eventStream';

describe('eventStream', () => {
  afterEach(() => vi.useRealTimers());

  it('preserves cursors beyond the JavaScript safe integer range', () => {
    expect(parseLastEventId('9007199254740993')).toBe('9007199254740993');
    expect(parseLastEventId('12junk')).toBe('0');
    expect(parseLastEventId('-1')).toBe('0');
    expect(parseLastEventId('9223372036854775808')).toBe('0');
  });

  it('orders PostgreSQL bigint string IDs numerically across digit boundaries', async () => {
    const listEvents = vi.fn().mockResolvedValue([]);
    const stream = createEventStream({
      signal: new AbortController().signal,
      afterEventId: 8,
      initialEvents: [
        { eventId: '9', eventType: 'summary.delta', payload: {} },
        { eventId: '10', eventType: 'session.failed', payload: {} },
      ],
      pollIntervalMs: 1,
      sessionFinished: true,
      listEvents,
    });
    const reader = stream.getReader();
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('id: 9');
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('id: 10');
      expect((await reader.read()).done).toBe(true);
      expect(listEvents).not.toHaveBeenCalled();
    } finally {
      await reader.cancel();
    }
  });

  it('closes on abort and discards the result of an outstanding poll', async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    let resolvePoll!: (events: { eventId: string; eventType: string; payload: object }[]) => void;
    const listEvents = vi.fn(() => new Promise<{ eventId: string; eventType: string; payload: object }[]>((resolve) => {
      resolvePoll = resolve;
    }));
    const reader = createEventStream({
      signal: abort.signal,
      afterEventId: 0,
      initialEvents: [],
      pollIntervalMs: 250,
      sessionFinished: false,
      listEvents,
    }).getReader();
    const read = reader.read();
    await vi.advanceTimersByTimeAsync(250);
    abort.abort();
    expect((await read).done).toBe(true);
    resolvePoll([{ eventId: '1', eventType: 'summary.delta', payload: {} }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries transient failures with the same precise cursor and emits idle heartbeats', async () => {
    vi.useFakeTimers();
    const listEvents = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue([]);
    const reader = createEventStream({
      signal: new AbortController().signal,
      afterEventId: '9007199254740993',
      initialEvents: [],
      pollIntervalMs: 250,
      sessionFinished: false,
      listEvents,
    }).getReader();
    try {
      const read = reader.read();
      await vi.advanceTimersByTimeAsync(15_000);
      expect(new TextDecoder().decode((await read).value)).toBe(': ping\n\n');
      expect(listEvents).toHaveBeenCalledWith('9007199254740993');
      expect(listEvents.mock.calls.every(([id]) => id === '9007199254740993')).toBe(true);
    } finally {
      await reader.cancel();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
