import process from 'node:process';
import type { PgBoss } from 'pg-boss';
import type { Pool } from 'pg';

type WorkerHandler = (jobs: unknown[]) => Promise<void>;

// 任务排空最多 60 秒，进程总退出最多 70 秒；Compose 另留 5 秒接收退出结果。
const DRAIN_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 70_000;

export function createWorkerLifecycle(deps: {
  boss: Pick<PgBoss, 'stop'>;
  pool: Pick<Pool, 'end'>;
  sampleStats: () => Promise<void>;
}) {
  const activeTasks = new Set<Promise<void>>();
  let statsSample: Promise<void> | null = null;
  let stopping = false;
  let shutdownPromise: Promise<void> | null = null;

  const statsTimer = setInterval(() => {
    // 不重叠采样，退出时也能准确等待最后一轮队列查询完成。
    if (stopping || statsSample) return;
    statsSample = Promise.resolve()
      .then(() => deps.sampleStats())
      .catch((error) => console.warn('[pgboss.stats.error]', error))
      .finally(() => { statsSample = null; });
  }, 60_000);
  statsTimer.unref();

  function trackHandler(handler: WorkerHandler): WorkerHandler {
    return (jobs) => {
      // 停止拉取交给 pg-boss；已发出的 fetch 可能在退出后返回最后一批任务。
      // 仍需跟踪这些回调，直接拒绝会使无需重试的任务被错误标记为失败。
      const task = Promise.resolve().then(() => handler(jobs));
      activeTasks.add(task);
      // 保留原始错误交给 pg-boss 处理，业务失败不妨碍后续资源清理。
      return task.finally(() => { activeTasks.delete(task); });
    };
  }

  function shutdown(): Promise<void> {
    // 多次 SIGINT / SIGTERM 必须共用一次清理，避免重复关闭连接池。
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    clearInterval(statsTimer);
    const startedAt = Date.now();
    // 保持此定时器引用：即使只剩挂起的 Promise，也必须执行退出上限。
    const deadline = setTimeout(() => {
      console.error('[worker.shutdown.timeout] 退出超过 70 秒，强制结束进程', {
        activeTasks: activeTasks.size,
      });
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    shutdownPromise = (async () => {
      const errors: unknown[] = [];
      // 先结束队列采样，防止 pg-boss 关闭连接后仍收到采样查询。
      await statsSample;
      try {
        await deps.boss.stop({
          graceful: true,
          close: true,
          timeout: Math.max(1_000, DRAIN_TIMEOUT_MS - (Date.now() - startedAt)),
        });
      } catch (error) {
        errors.push(error);
      }
      // pg-boss 等待超时后可能仍有未响应取消信号的业务回调。
      // 它们完成前保持业务池可用；若持续挂起，由总退出上限兜底。
      await Promise.allSettled([...activeTasks]);
      try {
        await deps.pool.end();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length) throw new AggregateError(errors, 'Worker 退出失败');
    })().finally(() => clearTimeout(deadline));
    return shutdownPromise;
  }

  return {
    trackHandler,
    shutdown,
  };
}
