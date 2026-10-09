import { Pool } from 'pg';
import { getServerEnv } from '@/server/infra/env';

export const WORKER_HEARTBEAT_INTERVAL_MS = 15_000;
export const WORKER_HEARTBEAT_MAX_AGE_MS = 60_000;
type Queryable = Pick<Pool, 'query'>;

let healthPool: Pool | null = null;

export function getHealthPool(): Pool {
  if (healthPool) return healthPool;
  // 探测使用独立的小连接池，连接和查询均有短超时，不与业务请求争抢连接。
  healthPool = new Pool({
    connectionString: getServerEnv().DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 1_000,
    statement_timeout: 500,
    query_timeout: 1_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  // 空闲连接断开不能导致 Web 或健康检查进程崩溃，也不输出连接凭据。
  healthPool.on('error', () => console.warn('[health.pool.error] 健康探测连接断开'));
  return healthPool;
}

export async function writeWorkerHeartbeat(pool: Queryable, workerId: string): Promise<void> {
  // 使用数据库时钟，避免 Web 与 Worker 的系统时间差造成错误判断。
  // 清理异常退出留下的旧实例，避免长期运行后心跳表无限增长。
  await pool.query(`
    with expired as (
      delete from worker_heartbeats where last_seen_at < clock_timestamp() - interval '1 day'
    )
    insert into worker_heartbeats (worker_id, last_seen_at)
    values ($1, clock_timestamp())
    on conflict (worker_id) do update set last_seen_at = excluded.last_seen_at
  `, [workerId]);
}

export async function removeWorkerHeartbeat(pool: Queryable, workerId: string): Promise<void> {
  await pool.query('delete from worker_heartbeats where worker_id = $1', [workerId]);
}

export async function readWorkerHeartbeat(pool: Queryable, workerId?: string) {
  // 整体健康只要求至少一个活跃实例；容器探测则只检查本容器保存的实例标识。
  const { rows } = await pool.query<{ last_seen_at: Date; fresh: boolean }>(`
    select last_seen_at,
      last_seen_at > clock_timestamp() - ($1 * interval '1 millisecond') as fresh
    from worker_heartbeats
    ${workerId === undefined ? '' : 'where worker_id = $2'}
    order by last_seen_at desc limit 1
  `, workerId === undefined ? [WORKER_HEARTBEAT_MAX_AGE_MS] : [WORKER_HEARTBEAT_MAX_AGE_MS, workerId]);
  const row = rows[0];
  return {
    status: !row ? 'missing' as const : row.fresh ? 'ok' as const : 'stale' as const,
    lastSeenAt: row?.last_seen_at.toISOString() ?? null,
  };
}

type HealthReport = {
  status: 'ok' | 'unavailable';
  checks: {
    database: 'ok' | 'unavailable';
    worker: 'ok' | 'unknown' | 'missing' | 'stale' | 'unavailable';
  };
  lastWorkerHeartbeatAt: string | null;
};

export async function getHealthReport(): Promise<HealthReport> {
  const report: HealthReport = {
    status: 'unavailable',
    checks: { database: 'unavailable', worker: 'unknown' },
    lastWorkerHeartbeatAt: null,
  };
  let pool: Pool;
  try {
    pool = getHealthPool();
    // 必须实际执行查询，不能只检查连接池对象是否已创建。
    await pool.query('select 1 as ready');
    report.checks.database = 'ok';
  } catch {
    return report;
  }
  try {
    const heartbeat = await readWorkerHeartbeat(pool);
    report.checks.worker = heartbeat.status;
    report.lastWorkerHeartbeatAt = heartbeat.lastSeenAt;
    if (heartbeat.status === 'ok') report.status = 'ok';
  } catch {
    // 迁移未完成或心跳查询失败时，保留数据库探测结果，不泄露底层错误。
    report.checks.worker = 'unavailable';
  }
  return report;
}
