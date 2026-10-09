import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import type { Pool } from 'pg';
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  writeWorkerHeartbeat,
  removeWorkerHeartbeat,
} from '@/server/infra/health/health';
import { WORKER_IDENTITY_PATH } from '@/worker/heartbeatIdentity';

export async function startWorkerHeartbeat(pool: Pick<Pool, 'query'>) {
  const workerId = randomUUID();
  // 启动完成后才发布就绪心跳；先移除重启前的标识，避免启动失败被旧记录掩盖。
  await rm(WORKER_IDENTITY_PATH, { force: true });
  await writeWorkerHeartbeat(pool, workerId);
  try {
    await writeFile(WORKER_IDENTITY_PATH, workerId, { mode: 0o600 });
  } catch (error) {
    await removeWorkerHeartbeat(pool, workerId);
    throw error;
  }

  let pending: Promise<void> | null = null;
  let stopping = false;
  let stopPromise: Promise<void> | null = null;
  const timer = setInterval(() => {
    // 空闲时也更新心跳；数据库变慢时最多保留一个在途更新，避免无限积压。
    if (stopping || pending) return;
    pending = writeWorkerHeartbeat(pool, workerId)
      .catch(() => console.warn('[worker.heartbeat.error] 心跳写入失败，将在下一周期重试'))
      .finally(() => { pending = null; });
  }, WORKER_HEARTBEAT_INTERVAL_MS);
  timer.unref();

  function stop(): Promise<void> {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearInterval(timer);
    stopPromise = (async () => {
      // 等待在途更新后再删除，防止退出过程中又把已删除的心跳插回数据库。
      await pending;
      try {
        await removeWorkerHeartbeat(pool, workerId);
      } finally {
        await rm(WORKER_IDENTITY_PATH, { force: true });
      }
    })();
    return stopPromise;
  }
  return { stop };
}
