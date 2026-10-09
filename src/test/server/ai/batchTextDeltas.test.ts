import { afterEach, describe, expect, it, vi } from 'vitest';
import { batchTextDeltas } from '@/server/integrations/ai/batchTextDeltas';

describe('batchTextDeltas', () => {
  afterEach(() => vi.useRealTimers());

  it('flushes buffered text on time even when the provider pauses', async () => {
    vi.useFakeTimers();
    let resume!: () => void;
    const paused = new Promise<void>((resolve) => { resume = resolve; });
    async function* source() {
      yield '首段';
      yield '尾段';
      await paused;
      yield '结束';
    }
    const batches = batchTextDeltas(source());
    expect(await batches.next()).toEqual({ value: '首段', done: false });
    const nextBatch = batches.next();
    await vi.advanceTimersByTimeAsync(250);
    expect(await nextBatch).toEqual({ value: '尾段', done: false });
    resume();
    expect(await batches.next()).toEqual({ value: '结束', done: false });
    expect((await batches.next()).done).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('delivers all received text before propagating an upstream error', async () => {
    async function* source() {
      yield '首段';
      yield '未完成的';
      yield '尾段';
      throw new Error('upstream failed');
    }
    const batches = batchTextDeltas(source());
    expect((await batches.next()).value).toBe('首段');
    expect((await batches.next()).value).toBe('未完成的尾段');
    await expect(batches.next()).rejects.toThrow('upstream failed');
  });
});
