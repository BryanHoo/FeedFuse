import type { Pool } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

export type AiSummarySessionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AiSummarySessionRow {
  id: string;
  userId: string;
  articleId: string;
  sourceTextHash: string;
  status: AiSummarySessionStatus;
  draftText: string;
  finalText: string | null;
  model: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  rawErrorMessage: string | null;
  supersededBySessionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiSummaryEventRow {
  eventId: number | string;
  userId: string;
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface UpsertAiSummarySessionInput {
  userId?: string;
  sessionId?: string | null;
  articleId: string;
  sourceTextHash: string;
  status: AiSummarySessionStatus;
  draftText: string;
  finalText?: string | null;
  model?: string | null;
  jobId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawErrorMessage?: string | null;
  supersededBySessionId?: string | null;
}

export interface UpdateAiSummarySessionDraftInput {
  jobId: string | null;
  userId?: string;
  sessionId: string;
  draftText: string;
}

export interface CompleteAiSummarySessionInput {
  jobId: string | null;
  userId?: string;
  sessionId: string;
  finalText: string;
  model: string;
}

export interface FailAiSummarySessionInput {
  jobId: string | null;
  userId?: string;
  sessionId: string;
  draftText: string;
  errorCode: string | null;
  errorMessage: string | null;
  rawErrorMessage: string | null;
}

export interface MarkAiSummarySessionSupersededInput {
  userId?: string;
  sessionId: string;
  supersededBySessionId: string;
}

export interface InsertAiSummaryEventInput {
  userId?: string;
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface ListAiSummaryEventsAfterInput {
  userId?: string;
  sessionId: string;
  afterEventId: number | string;
}

function sessionSelectSql() {
  return `
    id,
    user_id::text as "userId",
    article_id as "articleId",
    source_text_hash as "sourceTextHash",
    status,
    draft_text as "draftText",
    final_text as "finalText",
    model,
    job_id as "jobId",
    error_code as "errorCode",
    error_message as "errorMessage",
    raw_error_message as "rawErrorMessage",
    superseded_by_session_id as "supersededBySessionId",
    started_at as "startedAt",
    finished_at as "finishedAt",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}

export function upsertAiSummarySession(
  pool: Pick<Pool, 'query'>,
  input: UpsertAiSummarySessionInput & { sessionId?: null },
): Promise<AiSummarySessionRow>;
export function upsertAiSummarySession(
  pool: Pick<Pool, 'query'>,
  input: UpsertAiSummarySessionInput,
): Promise<AiSummarySessionRow | null>;
export async function upsertAiSummarySession(
  pool: Pick<Pool, 'query'>,
  input: UpsertAiSummarySessionInput,
): Promise<AiSummarySessionRow | null> {
  const userId = normalizeUserId(input.userId);
  if (input.sessionId == null) {
    const { rows } = await pool.query<AiSummarySessionRow>(
      `
        insert into article_ai_summary_sessions (
          user_id,
          article_id,
          source_text_hash,
          status,
          draft_text,
          final_text,
          model,
          job_id,
          error_code,
          error_message,
          raw_error_message,
          superseded_by_session_id,
          started_at,
          finished_at,
          created_at,
          updated_at
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          now(),
          case when $4 in ('succeeded', 'failed') then now() else null end,
          now(),
          now()
        )
        returning ${sessionSelectSql()}
      `,
      [
        userId,
        input.articleId,
        input.sourceTextHash,
        input.status,
        input.draftText,
        input.finalText ?? null,
        input.model ?? null,
        input.jobId ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.rawErrorMessage ?? null,
        input.supersededBySessionId ?? null,
      ],
    );
    return rows[0] as AiSummarySessionRow;
  }

  // Worker 只更新当前任务仍拥有的待处理会话；不能把终态重置为 running，也不能复活已替代会话。
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set source_text_hash = $4, status = $5, draft_text = $6,
          final_text = $7, model = $8,
          error_code = $10, error_message = $11, raw_error_message = $12,
          finished_at = null, updated_at = now()
      where user_id = $1 and id = $2::bigint and article_id = $3
        and job_id = $9
        and status in ('queued', 'running')
        and superseded_by_session_id is null
      returning ${sessionSelectSql()}
    `,
    [userId, input.sessionId, input.articleId, input.sourceTextHash, input.status,
      input.draftText, input.finalText ?? null, input.model ?? null, input.jobId ?? null,
      input.errorCode ?? null, input.errorMessage ?? null, input.rawErrorMessage ?? null],
  );
  return rows[0] ?? null;
}

export async function getActiveAiSummarySessionByArticleId(
  pool: Pick<Pool, 'query'>,
  articleId: string,
  userId?: string,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      select
        ${sessionSelectSql()}
      from article_ai_summary_sessions
      where user_id = $1
        and article_id = $2
        and superseded_by_session_id is null
      order by
        case when status in ('queued', 'running') then 0 else 1 end,
        updated_at desc
      limit 1
    `,
    [normalizeUserId(userId), articleId],
  );
  return rows[0] ?? null;
}

export async function getAiSummarySessionById(
  pool: Pick<Pool, 'query'>,
  sessionId: string,
  userId?: string,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      select
        ${sessionSelectSql()}
      from article_ai_summary_sessions
      where id = $1
        and user_id = $2
      limit 1
    `,
    [sessionId, normalizeUserId(userId)],
  );
  return rows[0] ?? null;
}

export async function updateAiSummarySessionDraft(
  pool: Pick<Pool, 'query'>,
  input: UpdateAiSummarySessionDraftInput,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set
        status = 'running',
        draft_text = $2,
        updated_at = now()
      where id = $1
        and user_id = $3
        and job_id = $4
        and status = 'running'
        and superseded_by_session_id is null
      returning ${sessionSelectSql()}
    `,
    [input.sessionId, input.draftText, normalizeUserId(input.userId), input.jobId],
  );
  return rows[0] ?? null;
}

export async function completeAiSummarySession(
  pool: Pick<Pool, 'query'>,
  input: CompleteAiSummarySessionInput,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set
        status = 'succeeded',
        draft_text = $2,
        final_text = $2,
        model = $3,
        error_code = null,
        error_message = null,
        raw_error_message = null,
        finished_at = now(),
        updated_at = now()
      where id = $1
        and user_id = $4
        and job_id = $5
        and status = 'running'
        and superseded_by_session_id is null
      returning ${sessionSelectSql()}
    `,
    [input.sessionId, input.finalText, input.model, normalizeUserId(input.userId), input.jobId],
  );
  return rows[0] ?? null;
}

export async function failAiSummarySession(
  pool: Pick<Pool, 'query'>,
  input: FailAiSummarySessionInput,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set
        status = 'failed',
        draft_text = $2,
        error_code = $3,
        error_message = $4,
        raw_error_message = $5,
        finished_at = now(),
        updated_at = now()
      where id = $1
        and user_id = $6
        and job_id = $7
        and status in ('queued', 'running')
        and superseded_by_session_id is null
      returning ${sessionSelectSql()}
    `,
    [
      input.sessionId,
      input.draftText,
      input.errorCode,
      input.errorMessage,
      input.rawErrorMessage,
      normalizeUserId(input.userId),
      input.jobId,
    ],
  );
  return rows[0] ?? null;
}

export async function markAiSummarySessionSuperseded(
  pool: Pick<Pool, 'query'>,
  input: MarkAiSummarySessionSupersededInput,
): Promise<void> {
  await pool.query(
    `
      update article_ai_summary_sessions
      set
        superseded_by_session_id = $2,
        updated_at = now()
      where id = $1
        and user_id = $3
    `,
    [input.sessionId, input.supersededBySessionId, normalizeUserId(input.userId)],
  );
}

export async function insertAiSummaryEvent(
  pool: Pick<Pool, 'query'>,
  input: InsertAiSummaryEventInput,
): Promise<AiSummaryEventRow> {
  const { rows } = await pool.query<AiSummaryEventRow>(
    `
      insert into article_ai_summary_events (
        user_id,
        session_id,
        event_type,
        payload
      )
      values ($1, $2, $3, $4)
      returning
        event_id as "eventId",
        user_id::text as "userId",
        session_id as "sessionId",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
    `,
    [normalizeUserId(input.userId), input.sessionId, input.eventType, input.payload ?? {}],
  );
  return rows[0] as AiSummaryEventRow;
}

export async function listAiSummaryEventsAfter(
  pool: Pick<Pool, 'query'>,
  input: ListAiSummaryEventsAfterInput,
): Promise<AiSummaryEventRow[]> {
  const { rows } = await pool.query<AiSummaryEventRow>(
    `
      select
        event_id as "eventId",
        user_id::text as "userId",
        session_id as "sessionId",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
      from article_ai_summary_events
      where user_id = $1
        and session_id = $2
        and event_id > $3
      order by event_id asc
      limit 200
    `,
    [normalizeUserId(input.userId), input.sessionId, input.afterEventId],
  );
  return rows;
}

// 事件只用于短期断线重放：完成七天后分批清理中间事件，保留终态用于旧客户端重连收尾。
export async function deleteExpiredAiSummaryEvents(
  pool: Pick<Pool, 'query'>,
  input: { userId: string },
): Promise<number> {
  const result = await pool.query(
    `
      delete from article_ai_summary_events
      where user_id = $1 and event_id in (
        select e.event_id
        from article_ai_summary_events e
        join article_ai_summary_sessions s on s.id = e.session_id and s.user_id = e.user_id
        where e.user_id = $1
          and s.status in ('succeeded', 'failed')
          and s.finished_at < now() - interval '7 days'
          and e.event_type not in ('session.completed', 'session.failed')
        order by e.event_id
        limit 5000
      )
    `,
    [normalizeUserId(input.userId)],
  );
  return result.rowCount ?? 0;
}

// 以文章行作为摘要创建的互斥点，锁内重新读取会话和任务，消除并发请求的检查后写入窗口。
export async function lockArticleForAiSummary(
  db: Pick<Pool, 'query'>,
  articleId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    'select id from articles where id = $1 and user_id = $2 for update',
    [articleId, normalizeUserId(userId)],
  );
  return rows.length > 0;
}
