import type { Pool, PoolClient } from 'pg';
import type { FeverBatchReadItemJob, MarkAllReadResult } from '@/types/feverBatchRead';
import { markAllRead, setArticleRead } from '@/server/domains/articles/repositories/articlesRepo';
import { getFeverItemMappingByLocalArticleId, listAllFeverMappedArticleIds, listUnreadActiveFeverItemMappings } from '../repositories/feverMappingsRepo';
import { createBatchReadItems, createBatchReadRun, listBatchReadTasks, lockBatchReadRun, resetFailedBatchReadItems, claimBatchReadItem, finishBatchReadItem } from '../repositories/feverBatchReadRepo';
import { createClientForAccount } from './feverWritebackService';
import { normalizeUserId } from '@/server/domains/users/userScope';
import { startBoss } from '@/server/infra/queue/boss';
import { ensureQueue } from '@/server/infra/queue/bootstrap';
import { createQueueTransactionDb } from '@/server/infra/queue/transactionDb';
import { JOB_FEVER_BATCH_READ_ITEM } from '@/server/infra/queue/jobs';
import { NotFoundError } from '@/server/infra/http/errors';

async function enqueueItems(db: PoolClient, items: FeverBatchReadItemJob[]) {
  if (items.length === 0) return;
  const boss = await startBoss();
  await ensureQueue(boss, JOB_FEVER_BATCH_READ_ITEM);
  // 业务记录和队列消息共用事务；任何一项入队失败，整次提交回滚。
  const queueDb = createQueueTransactionDb(db);
  // 分块批量插入队列，避免逐篇入队往返再次拖慢前端的提交请求。
  for (let offset = 0; offset < items.length; offset += 1000) {
    const chunk = items.slice(offset, offset + 1000);
    const jobIds = await boss.insert(JOB_FEVER_BATCH_READ_ITEM, chunk.map((data) => ({ data })), { db: queueDb, returnId: true });
    if (jobIds?.length !== chunk.length) throw new Error('批量已读任务入队失败');
  }
}

export async function startFeverBatchRead(pool: Pool, input: { feedId?: string; userId?: string }): Promise<MarkAllReadResult> {
  const userId = normalizeUserId(input.userId);
  const db = await pool.connect();
  try {
    await db.query('begin');
    const mappings = await listUnreadActiveFeverItemMappings(db, { ...input, userId });
    // 失效或停用的 Fever 映射也排除在本地批量兜底之外，避免绕过远端权威状态。
    const excluded = await listAllFeverMappedArticleIds(db, { ...input, userId });
    const updatedCount = await markAllRead(db, { ...input, userId, excludeArticleIds: excluded });
    let task = null;
    if (mappings.length > 0) {
      const runId = await createBatchReadRun(db, { ...input, userId, localUpdatedCount: updatedCount });
      const items = await createBatchReadItems(db, runId, userId, mappings);
      if (items.length !== mappings.length) throw new Error('批量已读目标已变更，请重试');
      await enqueueItems(db, items);
      [task] = await listBatchReadTasks(db, userId, runId);
    }
    await db.query('commit');
    return { updatedCount, task };
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}

export async function retryFeverBatchRead(pool: Pool, input: { runId: string; userId: string }) {
  const db = await pool.connect();
  try {
    await db.query('begin');
    // 锁定同一用户的批次，连续点击或多个页面重试不会重复创建任务。
    if (!await lockBatchReadRun(db, input.runId, input.userId)) throw new NotFoundError('未找到批量已读任务');
    const items = await resetFailedBatchReadItems(db, input.runId, input.userId);
    await enqueueItems(db, items);
    const [task] = await listBatchReadTasks(db, input.userId, input.runId);
    await db.query('commit');
    return task;
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}

export async function runFeverBatchReadItem(pool: Pool, job: FeverBatchReadItemJob): Promise<void> {
  const item = await claimBatchReadItem(pool, job);
  if (!item) return;
  try {
    // 使用持久化目标重新校验映射，账号停用、来源删除或跨用户目标都不能走本地兜底。
    const mapping = await getFeverItemMappingByLocalArticleId(pool, item.articleId, item.userId);
    if (!mapping || mapping.feverAccountId !== item.feverAccountId || mapping.feverItemId !== item.feverItemId) {
      throw new Error('Fever 来源已失效或账号已停用，无法写回远端状态');
    }
    const client = await createClientForAccount(pool, item.feverAccountId, item.userId);
    await client.markItem({ itemId: item.feverItemId, as: 'read' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fever 写回失败，请重试';
    await finishBatchReadItem(pool, item, 'failed', message);
    return;
  }

  const db = await pool.connect();
  try {
    await db.query('begin');
    // 单篇远端确认后立即落本地，成功标记与文章状态原子提交。
    // 入库异常继续抛给队列恢复；已读写回幂等，恢复时无需重放已成功的文章。
    if (await finishBatchReadItem(db, item, 'succeeded', null)) {
      await setArticleRead(db, item.articleId, true, item.userId);
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    db.release();
  }
}
