import { Pool } from 'pg';
import { getServerEnv } from '@/server/infra/env';

let pool: Pool | null = null;

function getPoolCounts(currentPool: Pool) {
  return {
    totalCount: currentPool.totalCount,
    idleCount: currentPool.idleCount,
    waitingCount: currentPool.waitingCount,
  };
}

function monitorPoolWaiting(currentPool: Pool): void {
  let lastWarningAt: number | null = null;
  // 排队期间可能没有 acquire/release 事件，定时采样才能发现连接全部被占用的情况。
  const timer = setInterval(() => {
    if (currentPool.ending || currentPool.ended) {
      clearInterval(timer);
      return;
    }
    if (currentPool.waitingCount === 0) {
      lastWarningAt = null;
      return;
    }
    const now = Date.now();
    // 持续积压每 30 秒最多告警一次；恢复后再次积压可立即告警。
    if (lastWarningAt !== null && now - lastWarningAt < 30_000) return;
    lastWarningAt = now;
    console.warn('[db.pool] 存在等待连接的请求', getPoolCounts(currentPool));
  }, 1_000);
  // 监控不阻止进程正常退出；池关闭后在下一次采样时清理定时器。
  timer.unref();
}

export function getPool(): Pool {
  if (pool) return pool;
  const { DATABASE_URL } = getServerEnv();
  const currentPool = new Pool({
    connectionString: DATABASE_URL,
    // 同时限制新建连接和池耗尽时的排队等待，避免请求无限挂起。
    connectionTimeoutMillis: 5_000,
    // 先由数据库取消慢语句，再由客户端超时兜底处理网络中断或无响应。
    statement_timeout: 30_000,
    query_timeout: 35_000,
  });
  currentPool.on('error', (error: Error) => {
    // pg 已移除故障连接；仅写进程日志，避免数据库故障时递归写数据库日志。
    // 不输出 pg 附加的 error.client，防止连接配置和查询上下文进入日志。
    console.error('[db.pool] 空闲连接发生错误', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }, getPoolCounts(currentPool));
  });
  monitorPoolWaiting(currentPool);
  pool = currentPool;
  return pool;
}
