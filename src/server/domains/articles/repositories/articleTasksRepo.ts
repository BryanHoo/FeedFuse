import type { Pool } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

export type ArticleTaskType = 'fulltext' | 'ai_summary' | 'ai_translate';
export type ArticleTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface ArticleTaskRow {
  id: string;
  userId: string;
  articleId: string;
  type: ArticleTaskType;
  status: ArticleTaskStatus;
  jobId: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  rawErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function getArticleTasksByArticleId(
  pool: Pick<Pool, 'query'>,
  articleId: string,
  userId?: string | null,
): Promise<ArticleTaskRow[]> {
  const scopedUserId = normalizeUserId(userId);
  const { rows } = await pool.query<ArticleTaskRow>(
    `
      select
        id,
        user_id::text as "userId",
        article_id as "articleId",
        type,
        status,
        job_id as "jobId",
        requested_at as "requestedAt",
        started_at as "startedAt",
        finished_at as "finishedAt",
        attempts,
        error_code as "errorCode",
        error_message as "errorMessage",
        raw_error_message as "rawErrorMessage",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from article_tasks
      where article_id = $1 and user_id = $2
    `,
    [articleId, scopedUserId],
  );
  return rows;
}

async function upsertBase(
  pool: Pick<Pool, 'query'>,
  input: {
    userId?: string | null;
    articleId: string;
    type: ArticleTaskType;
    status: ArticleTaskStatus;
    jobId: string | null;
    requestedAt?: 'now' | 'keep' | 'null';
    startedAt?: 'now' | 'keep' | 'null';
    finishedAt?: 'now' | 'keep' | 'null';
    attempts?: 'inc' | number | 'keep';
    errorCode?: string | null;
    errorMessage?: string | null;
    rawErrorMessage?: string | null;
    clearError?: boolean;
    allowNewJob?: boolean;
  },
): Promise<boolean> {
  const scopedUserId = normalizeUserId(input.userId);
  const requestedAtSql =
    input.requestedAt === 'now'
      ? 'now()'
      : input.requestedAt === 'null'
        ? 'null'
        : 'article_tasks.requested_at';
  const startedAtSql =
    input.startedAt === 'now'
      ? 'now()'
      : input.startedAt === 'null'
        ? 'null'
        : 'article_tasks.started_at';
  const finishedAtSql =
    input.finishedAt === 'now'
      ? 'now()'
      : input.finishedAt === 'null'
        ? 'null'
        : 'article_tasks.finished_at';
  const attemptsSql =
    input.attempts === 'inc'
      ? 'article_tasks.attempts + 1'
      : typeof input.attempts === 'number'
        ? String(input.attempts)
        : 'article_tasks.attempts';

  const errorCode = input.clearError ? null : (input.errorCode ?? null);
  const errorMessage = input.clearError ? null : (input.errorMessage ?? null);
  const rawErrorMessage = input.clearError ? null : (input.rawErrorMessage ?? null);

  // 摘要任务只能推进属于同一 jobId 的预期状态，旧 Worker 不得覆盖重试任务或终态。
  const guarded = input.type === 'ai_summary' && input.status !== 'queued';
  const expectedStatuses = input.status === 'succeeded' ? ['running'] : ['queued', 'running'];
  const result = await pool.query(
    `
      insert into article_tasks (
        user_id,
        article_id,
        type,
        status,
        job_id,
        requested_at,
        started_at,
        finished_at,
        attempts,
        error_code,
        error_message,
        raw_error_message,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now(), null, null, 0, null, null, null, now(), now())
      on conflict (user_id, article_id, type) do update
      set
        status = $4,
        job_id = coalesce($5, article_tasks.job_id),
        requested_at = ${requestedAtSql},
        started_at = ${startedAtSql},
        finished_at = ${finishedAtSql},
        attempts = ${attemptsSql},
        error_code = $6,
        error_message = $7,
        raw_error_message = $8,
        updated_at = now()
      ${guarded ? `where (
        (article_tasks.job_id = $5 and article_tasks.status = any($9::text[]))
        ${input.status === 'running' ? "or ($10::boolean and article_tasks.status in ('succeeded', 'failed'))" : ''}
      )` : ''}
    `,
    [
      scopedUserId,
      input.articleId,
      input.type,
      input.status,
      input.jobId,
      errorCode,
      errorMessage,
      rawErrorMessage,
      ...(guarded ? [expectedStatuses, ...(input.status === 'running' ? [input.allowNewJob ?? false] : [])] : []),
    ],
  );
  return result.rowCount !== 0;
}

export async function upsertTaskQueued(
  pool: Pick<Pool, 'query'>,
  input: { userId?: string | null; articleId: string; type: ArticleTaskType; jobId: string | null },
): Promise<void> {
  await upsertBase(pool, {
    userId: input.userId,
    articleId: input.articleId,
    type: input.type,
    status: 'queued',
    jobId: input.jobId,
    requestedAt: 'now',
    startedAt: 'null',
    finishedAt: 'null',
    attempts: 'keep',
    clearError: true,
  });
}

export async function upsertTaskRunning(
  pool: Pick<Pool, 'query'>,
  input: { userId?: string | null; articleId: string; type: ArticleTaskType; jobId: string | null; allowNewJob?: boolean },
): Promise<boolean> {
  return upsertBase(pool, {
    userId: input.userId,
    articleId: input.articleId,
    type: input.type,
    status: 'running',
    jobId: input.jobId,
    // 自动任务没有 API 预建的任务行，允许接续历史终态；仍禁止抢占其他 jobId 的活跃任务。
    allowNewJob: input.allowNewJob,
    requestedAt: 'keep',
    startedAt: 'now',
    finishedAt: 'null',
    attempts: 'keep',
    clearError: false,
  });
}

export async function upsertTaskSucceeded(
  pool: Pick<Pool, 'query'>,
  input: { userId?: string | null; articleId: string; type: ArticleTaskType; jobId: string | null },
): Promise<boolean> {
  return upsertBase(pool, {
    userId: input.userId,
    articleId: input.articleId,
    type: input.type,
    status: 'succeeded',
    jobId: input.jobId,
    requestedAt: 'keep',
    startedAt: 'keep',
    finishedAt: 'now',
    attempts: 'keep',
    clearError: true,
  });
}

export async function upsertTaskFailed(
  pool: Pick<Pool, 'query'>,
  input: {
    userId?: string | null;
    articleId: string;
    type: ArticleTaskType;
    jobId: string | null;
    errorCode: string;
    errorMessage: string;
    rawErrorMessage: string | null;
  },
): Promise<boolean> {
  return upsertBase(pool, {
    userId: input.userId,
    articleId: input.articleId,
    type: input.type,
    status: 'failed',
    jobId: input.jobId,
    requestedAt: 'keep',
    startedAt: 'keep',
    finishedAt: 'now',
    attempts: 'inc',
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    rawErrorMessage: input.rawErrorMessage,
    clearError: false,
  });
}
