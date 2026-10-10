import type { Pool, PoolClient } from 'pg';
import type { FeverBatchReadTask, FeverBatchReadItemJob } from '@/types/feverBatchRead';
import type { FeverUnreadItemMappingRow } from './feverMappingsRepo';

type DbClient = Pool | PoolClient;

const itemReturning = `run_id as "runId", user_id as "userId", article_id as "articleId",
  fever_account_id as "feverAccountId", fever_item_id as "feverItemId", attempt`;

export async function createBatchReadRun(db: DbClient, input: { userId: string; feedId?: string; localUpdatedCount: number }): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into fever_batch_read_runs(user_id, feed_id, local_updated_count) values ($1, $2, $3) returning id`,
    [input.userId, input.feedId ?? null, input.localUpdatedCount],
  );
  return rows[0].id;
}

export async function createBatchReadItems(db: DbClient, runId: string, userId: string, mappings: FeverUnreadItemMappingRow[]): Promise<FeverBatchReadItemJob[]> {
  const { rows } = await db.query<FeverBatchReadItemJob>(
    `insert into fever_batch_read_items(user_id, run_id, article_id, article_title, fever_account_id, fever_item_id)
     select $1, $2, a.id, a.title, m."feverAccountId"::bigint, m."feverItemId"
     from jsonb_to_recordset($3::jsonb) as m("localArticleId" text, "feverAccountId" text, "feverItemId" text)
     join articles a on a.id = m."localArticleId"::bigint and a.user_id = $1
     returning ${itemReturning}`,
    [userId, runId, JSON.stringify(mappings)],
  );
  return rows;
}

export async function listBatchReadTasks(db: DbClient, userId: string, runId?: string): Promise<FeverBatchReadTask[]> {
  // 从逐项状态实时聚合，避免多个 Worker 并发写入时覆盖整批计数。
  const { rows } = await db.query<FeverBatchReadTask>(
    `select r.id, r.feed_id as "feedId", r.local_updated_count as "localUpdatedCount",
       count(i.article_id)::int as "totalCount",
       count(*) filter (where i.status = 'succeeded')::int as "succeededCount",
       count(*) filter (where i.status = 'failed')::int as "failedCount",
       case when bool_or(i.status = 'running') then 'running'
            when bool_or(i.status = 'queued') then
              case when bool_or(i.status in ('succeeded', 'failed')) then 'running' else 'queued' end
            when bool_or(i.status = 'failed') then 'failed' else 'succeeded' end as status,
       coalesce(jsonb_agg(jsonb_build_object('articleId', i.article_id::text, 'title', i.article_title,
         'errorMessage', i.error_message) order by i.article_id) filter (where i.status = 'failed'), '[]'::jsonb) as failures
     from fever_batch_read_runs r
     left join fever_batch_read_items i on i.run_id = r.id and i.user_id = r.user_id
     where r.user_id = $1 ${runId ? 'and r.id = $2' : ''}
     group by r.id order by r.id desc `,
    runId ? [userId, runId] : [userId],
  );
  return rows;
}

export async function lockBatchReadRun(db: DbClient, runId: string, userId: string): Promise<boolean> {
  const { rows } = await db.query(`select id from fever_batch_read_runs where id = $1 and user_id = $2 for update`, [runId, userId]);
  return rows.length > 0;
}

export async function resetFailedBatchReadItems(db: DbClient, runId: string, userId: string): Promise<FeverBatchReadItemJob[]> {
  // 重试只选择失败项并递增版本；成功项保持不变，旧队列消息不能覆盖新一轮结果。
  const { rows } = await db.query<FeverBatchReadItemJob>(
    `update fever_batch_read_items set status = 'queued', error_message = null, attempt = attempt + 1, updated_at = now()
     where run_id = $1 and user_id = $2 and status = 'failed' returning ${itemReturning}`, [runId, userId],
  );
  return rows;
}

export async function claimBatchReadItem(db: DbClient, job: FeverBatchReadItemJob): Promise<FeverBatchReadItemJob | null> {
  const { rows } = await db.query<FeverBatchReadItemJob>(
    `update fever_batch_read_items set status = 'running', updated_at = now()
     where run_id = $1 and user_id = $2 and article_id = $3 and attempt = $4
       and status in ('queued', 'running') returning ${itemReturning}`,
    [job.runId, job.userId, job.articleId, job.attempt],
  );
  return rows[0] ?? null;
}

export async function finishBatchReadItem(db: DbClient, job: FeverBatchReadItemJob, status: 'succeeded' | 'failed', errorMessage: string | null): Promise<boolean> {
  const { rowCount } = await db.query(
    `update fever_batch_read_items set status = $5, error_message = $6, updated_at = now()
     where run_id = $1 and user_id = $2 and article_id = $3 and attempt = $4 and (status = 'running' or ($5 = 'failed' and status = 'queued'))`,
    [job.runId, job.userId, job.articleId, job.attempt, status, errorMessage],
  );
  return (rowCount ?? 0) > 0;
}
