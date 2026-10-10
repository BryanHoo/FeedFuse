import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import {
  getActiveAiSummarySessionByArticleId,
  lockArticleForAiSummary,
  markAiSummarySessionSuperseded,
  upsertAiSummarySession,
} from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import {
  getArticleTasksByArticleId,
  upsertTaskQueued,
  type ArticleTaskRow,
} from '@/server/domains/articles/repositories/articleTasksRepo';
import { NotFoundError } from '@/server/infra/http/errors';
import { writeUserOperationStartedLog } from '@/server/infra/logging/userOperationLogger';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_AI_SUMMARIZE } from '@/server/infra/queue/jobs';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { createQueueTransactionDb } from '@/server/infra/queue/transactionDb';

const SUMMARY_TASK_STALE_MS = 10 * 60 * 1000;

function isTaskActive(task: ArticleTaskRow | undefined, jobId: string | null): boolean {
  // 缺失任务或归属不同的任务都不能替孤立会话保活，否则会永久阻止用户重试。
  if (!task || !jobId || task.jobId !== jobId) return false;
  if (task.status !== 'queued' && task.status !== 'running') return false;
  const reference = [task.startedAt, task.requestedAt, task.updatedAt, task.createdAt]
    .map((value) => value ? Date.parse(value) : NaN)
    .find(Number.isFinite);
  return reference === undefined || Date.now() - reference <= SUMMARY_TASK_STALE_MS;
}

export async function enqueueAiSummarySession(input: {
  pool: Pool;
  userId: string;
  articleId: string;
  sourceTextHash: string;
  sharedConfigFingerprint: string;
  force: boolean;
}): Promise<
  | { enqueued: true; jobId: string; sessionId: string }
  | { enqueued: false; reason: 'already_enqueued'; sessionId?: string }
> {
  const { pool, userId, articleId, sourceTextHash, sharedConfigFingerprint, force } = input;
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (!await lockArticleForAiSummary(client, articleId, userId)) {
      throw new NotFoundError('Article not found');
    }
    const existing = await getActiveAiSummarySessionByArticleId(client, articleId, userId);
    const existingPending = existing?.status === 'queued' || existing?.status === 'running';
    if (existingPending) {
      const tasks = await getArticleTasksByArticleId(client, articleId, userId);
      if (isTaskActive(tasks.find((task) => task.type === 'ai_summary'), existing.jobId)) {
        await client.query('commit');
        return { enqueued: false, reason: 'already_enqueued', sessionId: existing.id };
      }
    }

    // 预分配任务 ID，首次写入即绑定会话；提交后接口不再重写 queued，Worker 可安全立即执行。
    const jobId = randomUUID();
    const session = await upsertAiSummarySession(client, {
      userId, articleId, sourceTextHash, status: 'queued', draftText: '', jobId,
    });
    const result = await enqueueWithResult(
      JOB_AI_SUMMARIZE,
      { userId, articleId, sessionId: session.id, sharedConfigFingerprint },
      {
        ...getQueueSendOptions(JOB_AI_SUMMARIZE, { userId, articleId }),
        id: jobId,
        db: createQueueTransactionDb(client),
      },
    );
    if (result.status !== 'enqueued') {
      // 时间窗去重也回滚会话，旧会话保持原样；不向客户端返回已回滚的会话 ID。
      await client.query('rollback');
      return { enqueued: false, reason: 'already_enqueued', ...(existing ? { sessionId: existing.id } : {}) };
    }
    await upsertTaskQueued(client, { userId, articleId, type: 'ai_summary', jobId: result.jobId });
    if (existing && existing.id !== session.id && (force || existingPending)) {
      await markAiSummarySessionSuperseded(client, {
        userId, sessionId: existing.id, supersededBySessionId: session.id,
      });
    }
    await writeUserOperationStartedLog(client, {
      userId,
      actionKey: 'article.aiSummary.generate',
      source: 'app/api/articles/[id]/ai-summary',
      context: { articleId, sessionId: session.id, jobId: result.jobId },
    });
    await client.query('commit');
    return { enqueued: true, jobId: result.jobId, sessionId: session.id };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
