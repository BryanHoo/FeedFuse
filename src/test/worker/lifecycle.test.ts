import process from 'node:process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerLifecycle } from '@/worker/lifecycle';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const boss = { stop: vi.fn().mockResolvedValue(undefined) };
  const pool = { end: vi.fn().mockResolvedValue(undefined) };
  const sampleStats = vi.fn().mockResolvedValue(undefined);
  return { boss, pool, sampleStats };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('worker lifecycle', () => {
  it('stops and removes the heartbeat before closing the business pool', async () => {
    const deps = setup();
    const heartbeat = deferred();
    const stopHeartbeat = vi.fn(() => heartbeat.promise);
    const lifecycle = createWorkerLifecycle({ ...deps, stopHeartbeat });
    const shutdown = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect(stopHeartbeat).toHaveBeenCalledTimes(1);
    expect(deps.pool.end).not.toHaveBeenCalled();
    heartbeat.resolve();
    await shutdown;
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
  });

  it('stops sampling, drains pg-boss and then closes the business pool only once', async () => {
    const deps = setup();
    const drain = deferred();
    deps.boss.stop.mockReturnValue(drain.promise);
    const lifecycle = createWorkerLifecycle(deps);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.sampleStats).toHaveBeenCalledTimes(1);

    const shutdown = lifecycle.shutdown();
    expect(lifecycle.shutdown()).toBe(shutdown);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.boss.stop).toHaveBeenCalledWith({ graceful: true, close: true, timeout: 60_000 });
    expect(deps.pool.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.sampleStats).toHaveBeenCalledTimes(1);
    drain.resolve();
    await shutdown;
    expect(deps.boss.stop).toHaveBeenCalledTimes(1);
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for an in-flight stats sample and deducts its time from the drain budget', async () => {
    const deps = setup();
    const sample = deferred();
    deps.sampleStats.mockReturnValue(sample.promise);
    const lifecycle = createWorkerLifecycle(deps);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.sampleStats).toHaveBeenCalledTimes(1);
    const shutdown = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(deps.boss.stop).not.toHaveBeenCalled();
    sample.resolve();
    await shutdown;
    expect(deps.boss.stop).toHaveBeenCalledWith({ graceful: true, close: true, timeout: 55_000 });
  });

  it('keeps the pool available until business callbacks finish even if pg-boss has stopped', async () => {
    const deps = setup();
    const task = deferred();
    const lifecycle = createWorkerLifecycle(deps);
    const handler = vi.fn(() => task.promise);
    const work = lifecycle.trackHandler(handler)([]);
    const shutdown = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.boss.stop).toHaveBeenCalledTimes(1);
    expect(deps.pool.end).not.toHaveBeenCalled();
    task.resolve();
    await work;
    await shutdown;
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
  });

  it('drains callbacks from a fetch already in flight when shutdown starts', async () => {
    const deps = setup();
    const drain = deferred();
    const task = deferred();
    deps.boss.stop.mockReturnValue(drain.promise);
    const lifecycle = createWorkerLifecycle(deps);
    const shutdown = lifecycle.shutdown();
    // pg-boss 停止拉取后，已发出的 fetch 仍可能返回最后一批任务。
    const work = lifecycle.trackHandler(() => task.promise)([]);
    const result = work.then(() => null, (error: unknown) => error);
    drain.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.pool.end).not.toHaveBeenCalled();
    task.resolve();
    expect(await result).toBeNull();
    await shutdown;
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
  });

  it('lets pg-boss observe task errors without preventing pool cleanup', async () => {
    const deps = setup();
    const lifecycle = createWorkerLifecycle(deps);
    const error = new Error('task failed');
    const work = lifecycle.trackHandler(async () => { throw error; })([]);
    const rejected = expect(work).rejects.toBe(error);
    await lifecycle.shutdown();
    await rejected;
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
  });

  it('still closes the business pool if stopping pg-boss fails', async () => {
    const deps = setup();
    const error = new Error('boss stop failed');
    deps.boss.stop.mockRejectedValue(error);
    const lifecycle = createWorkerLifecycle(deps);
    await expect(lifecycle.shutdown()).rejects.toThrow(/退出失败/);
    expect(deps.pool.end).toHaveBeenCalledTimes(1);
  });

  it.each(['boss', 'pool', 'task'] as const)('forces a failure exit at 70 seconds if %s hangs', async (resource) => {
    const deps = setup();
    const stalled = deferred();
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (resource === 'boss') deps.boss.stop.mockReturnValue(stalled.promise);
    if (resource === 'pool') deps.pool.end.mockReturnValue(stalled.promise);
    const lifecycle = createWorkerLifecycle(deps);
    const work = resource === 'task' ? lifecycle.trackHandler(() => stalled.promise)([]) : undefined;
    const shutdown = lifecycle.shutdown();
    await vi.advanceTimersByTimeAsync(69_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    stalled.resolve();
    await work;
    await shutdown;
  });
});
