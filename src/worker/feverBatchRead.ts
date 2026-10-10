import type { Pool } from 'pg';
import { z } from 'zod';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { runFeverBatchReadItem } from '@/server/domains/fever/services/feverBatchReadService';
import { finishBatchReadItem } from '@/server/domains/fever/repositories/feverBatchReadRepo';

const jobDataSchema = z.object({
  userId: numericIdSchema, runId: numericIdSchema, articleId: numericIdSchema,
  feverAccountId: numericIdSchema, feverItemId: z.string().min(1), attempt: z.number().int().positive(),
});

export async function runFeverBatchReadWorker(pool: Pool, job: { data?: unknown; retryCount?: number; retryLimit?: number }) {
  const data = jobDataSchema.parse(job.data);
  try {
    await runFeverBatchReadItem(pool, data);
  } catch (error) {
    // 远端失败已由服务逐项结算；进程或入库异常交给队列重试，耗尽预算时显示失败项。
    if (typeof job.retryCount === 'number' && typeof job.retryLimit === 'number' && job.retryCount >= job.retryLimit) {
      await finishBatchReadItem(pool, data, 'failed', '保存已读结果失败，请重试');
    }
    throw error;
  }
}
