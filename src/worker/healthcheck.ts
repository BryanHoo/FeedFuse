import { readFile } from 'node:fs/promises';
import { getHealthPool, readWorkerHeartbeat } from '@/server/infra/health/health';
import { WORKER_IDENTITY_PATH } from '@/worker/heartbeatIdentity';

async function main() {
  const pool = getHealthPool();
  try {
    // 按本容器的实例查询；其他活跃 Worker 不能掩盖本容器已停止工作的事实。
    const workerId = (await readFile(WORKER_IDENTITY_PATH, 'utf8')).trim();
    if (!workerId) throw new Error('缺少 Worker 实例标识');
    const heartbeat = await readWorkerHeartbeat(pool, workerId);
    if (heartbeat.status !== 'ok') throw new Error('Worker 心跳缺失或已过期');
  } finally {
    await pool.end();
  }
}

main().catch(() => {
  console.error('[worker.healthcheck] 数据库不可用或 Worker 心跳未就绪');
  process.exitCode = 1;
});
