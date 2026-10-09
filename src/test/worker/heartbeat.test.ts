import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWorkerHeartbeat } from '@/worker/heartbeat';

const { write, remove, writeFile, rm } = vi.hoisted(() => ({
  write: vi.fn(), remove: vi.fn(), writeFile: vi.fn(), rm: vi.fn(),
}));
vi.mock('@/server/infra/health/health', () => ({
  WORKER_HEARTBEAT_INTERVAL_MS: 15_000,
  writeWorkerHeartbeat: write,
  removeWorkerHeartbeat: remove,
}));
vi.mock('node:fs/promises', () => ({ writeFile, rm }));

const pool = {} as Parameters<typeof startWorkerHeartbeat>[0];

beforeEach(() => {
  vi.useFakeTimers();
  write.mockReset().mockResolvedValue(undefined);
  remove.mockReset().mockResolvedValue(undefined);
  writeFile.mockReset().mockResolvedValue(undefined);
  rm.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('worker heartbeat', () => {
  it('publishes immediately, repeats when idle and removes only its own instance on stop', async () => {
    const heartbeat = await startWorkerHeartbeat(pool);
    expect(write).toHaveBeenCalledTimes(1);
    const workerId = write.mock.calls[0][1];
    expect(writeFile).toHaveBeenCalledWith(expect.any(String), workerId, { mode: 0o600 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(write).toHaveBeenCalledTimes(3);
    await heartbeat.stop();
    expect(remove).toHaveBeenCalledWith(pool, workerId);
    await heartbeat.stop();
    expect(remove).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('does not overlap slow updates or recreate a heartbeat during shutdown', async () => {
    let finish!: () => void;
    write.mockResolvedValueOnce(undefined).mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const heartbeat = await startWorkerHeartbeat(pool);
    await vi.advanceTimersByTimeAsync(45_000);
    expect(write).toHaveBeenCalledTimes(2);
    const stopped = heartbeat.stop();
    expect(remove).not.toHaveBeenCalled();
    finish();
    await stopped;
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('recovers from a failed periodic update on the next interval', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    write.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('database unavailable'));
    const heartbeat = await startWorkerHeartbeat(pool);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(write).toHaveBeenCalledTimes(3);
    await heartbeat.stop();
  });

  it('rejects startup without publishing an identity when the first write fails', async () => {
    write.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(startWorkerHeartbeat(pool)).rejects.toThrow('database unavailable');
    expect(writeFile).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up the database record if publishing the local identity fails', async () => {
    writeFile.mockRejectedValueOnce(new Error('disk unavailable'));
    await expect(startWorkerHeartbeat(pool)).rejects.toThrow('disk unavailable');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
