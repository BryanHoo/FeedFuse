import { startBoss } from '@/server/infra/queue/boss';
import { ensureQueue } from '@/server/infra/queue/bootstrap';

export type EnqueueResult =
  | { status: 'enqueued'; jobId: string }
  | { status: 'throttled_or_duplicate' };

export async function enqueueWithResult(
  name: string,
  data: object | null,
  options?: unknown,
): Promise<EnqueueResult> {
  const instance = await startBoss();
  await ensureQueue(instance, name);
  // 等待契约配置同步成功后再发送；pg-boss 的 CJS/ESM 类型不同，保留宽松选项类型。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobId = await instance.send(name, data, options as any);
  if (!jobId) return { status: 'throttled_or_duplicate' };
  return { status: 'enqueued', jobId: String(jobId) };
}

export async function enqueue(
  name: string,
  data: object | null,
  options?: unknown,
): Promise<string> {
  const result = await enqueueWithResult(name, data, options);
  if (result.status !== 'enqueued') throw new Error('Failed to enqueue job');
  return result.jobId;
}
