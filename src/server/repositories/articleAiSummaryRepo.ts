import type { Pool } from 'pg';

export type AiSummarySessionStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AiSummarySessionRow {
  id: string;
  articleId: string;
  sourceTextHash: string;
  status: AiSummarySessionStatus;
  draftText: string;
  finalText: string | null;
  model: string | null;
  jobId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  supersededBySessionId: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiSummaryEventRow {
  eventId: number;
  sessionId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface UpsertAiSummarySessionInput {
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
  supersededBySessionId?: string | null;
}

export interface UpdateAiSummarySessionDraftInput {
  sessionId: string;
  draftText: string;
}

export interface CompleteAiSummarySessionInput {
  sessionId: string;
  finalText: string;
  model: string;
}

export interface FailAiSummarySessionInput {
  sessionId: string;
  draftText: string;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface MarkAiSummarySessionSupersededInput {
  sessionId: string;
  supersededBySessionId: string;
}

export interface InsertAiSummaryEventInput {
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}

export interface ListAiSummaryEventsAfterInput {
  sessionId: string;
  afterEventId: number;
}

function sessionSelectSql() {
  return `
    id,
    article_id as "articleId",
    source_text_hash as "sourceTextHash",
    status,
    draft_text as "draftText",
    final_text as "finalText",
    model,
    job_id as "jobId",
    error_code as "errorCode",
    error_message as "errorMessage",
    superseded_by_session_id as "supersededBySessionId",
    started_at as "startedAt",
    finished_at as "finishedAt",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
}

export async function upsertAiSummarySession(
  pool: Pool,
  input: UpsertAiSummarySessionInput,
): Promise<AiSummarySessionRow> {
  if (input.sessionId == null) {
    const { rows } = await pool.query<AiSummarySessionRow>(
      `
        insert into article_ai_summary_sessions (
          article_id,
          source_text_hash,
          status,
          draft_text,
          final_text,
          model,
          job_id,
          error_code,
          error_message,
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
          now(),
          case when $3 in ('succeeded', 'failed') then now() else null end,
          now(),
          now()
        )
        returning ${sessionSelectSql()}
      `,
      [
        input.articleId,
        input.sourceTextHash,
        input.status,
        input.draftText,
        input.finalText ?? null,
        input.model ?? null,
        input.jobId ?? null,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        input.supersededBySessionId ?? null,
      ],
    );
    return rows[0] as AiSummarySessionRow;
  }

  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      insert into article_ai_summary_sessions (
        id,
        article_id,
        source_text_hash,
        status,
        draft_text,
        final_text,
        model,
        job_id,
        error_code,
        error_message,
        superseded_by_session_id,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      values (
        $1::bigint,
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
        now(),
        case when $4 in ('succeeded', 'failed') then now() else null end,
        now(),
        now()
      )
      on conflict (id) do update
      set
        article_id = excluded.article_id,
        source_text_hash = excluded.source_text_hash,
        status = excluded.status,
        draft_text = excluded.draft_text,
        final_text = excluded.final_text,
        model = excluded.model,
        job_id = excluded.job_id,
        error_code = excluded.error_code,
        error_message = excluded.error_message,
        superseded_by_session_id = excluded.superseded_by_session_id,
        finished_at = case
          when excluded.status in ('succeeded', 'failed') then coalesce(article_ai_summary_sessions.finished_at, now())
          else null
        end,
        updated_at = now()
      returning ${sessionSelectSql()}
    `,
    [
      input.sessionId ?? null,
      input.articleId,
      input.sourceTextHash,
      input.status,
      input.draftText,
      input.finalText ?? null,
      input.model ?? null,
      input.jobId ?? null,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.supersededBySessionId ?? null,
    ],
  );
  return rows[0] as AiSummarySessionRow;
}

export async function getActiveAiSummarySessionByArticleId(
  pool: Pool,
  articleId: string,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      select
        ${sessionSelectSql()}
      from article_ai_summary_sessions
      where article_id = $1
        and superseded_by_session_id is null
      order by
        case when status in ('queued', 'running') then 0 else 1 end,
        updated_at desc
      limit 1
    `,
    [articleId],
  );
  return rows[0] ?? null;
}

export async function getAiSummarySessionById(
  pool: Pool,
  sessionId: string,
): Promise<AiSummarySessionRow | null> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      select
        ${sessionSelectSql()}
      from article_ai_summary_sessions
      where id = $1
      limit 1
    `,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function updateAiSummarySessionDraft(
  pool: Pool,
  input: UpdateAiSummarySessionDraftInput,
): Promise<AiSummarySessionRow> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set
        status = 'running',
        draft_text = $2,
        updated_at = now()
      where id = $1
      returning ${sessionSelectSql()}
    `,
    [input.sessionId, input.draftText],
  );
  return rows[0] as AiSummarySessionRow;
}

export async function completeAiSummarySession(
  pool: Pool,
  input: CompleteAiSummarySessionInput,
): Promise<AiSummarySessionRow> {
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
        finished_at = now(),
        updated_at = now()
      where id = $1
      returning ${sessionSelectSql()}
    `,
    [input.sessionId, input.finalText, input.model],
  );
  return rows[0] as AiSummarySessionRow;
}

export async function failAiSummarySession(
  pool: Pool,
  input: FailAiSummarySessionInput,
): Promise<AiSummarySessionRow> {
  const { rows } = await pool.query<AiSummarySessionRow>(
    `
      update article_ai_summary_sessions
      set
        status = 'failed',
        draft_text = $2,
        error_code = $3,
        error_message = $4,
        finished_at = now(),
        updated_at = now()
      where id = $1
      returning ${sessionSelectSql()}
    `,
    [input.sessionId, input.draftText, input.errorCode, input.errorMessage],
  );
  return rows[0] as AiSummarySessionRow;
}

export async function markAiSummarySessionSuperseded(
  pool: Pool,
  input: MarkAiSummarySessionSupersededInput,
): Promise<void> {
  await pool.query(
    `
      update article_ai_summary_sessions
      set
        superseded_by_session_id = $2,
        updated_at = now()
      where id = $1
    `,
    [input.sessionId, input.supersededBySessionId],
  );
}

export async function insertAiSummaryEvent(
  pool: Pool,
  input: InsertAiSummaryEventInput,
): Promise<AiSummaryEventRow> {
  const { rows } = await pool.query<AiSummaryEventRow>(
    `
      insert into article_ai_summary_events (
        session_id,
        event_type,
        payload
      )
      values ($1, $2, $3)
      returning
        event_id as "eventId",
        session_id as "sessionId",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
    `,
    [input.sessionId, input.eventType, input.payload ?? {}],
  );
  return rows[0] as AiSummaryEventRow;
}

export async function listAiSummaryEventsAfter(
  pool: Pool,
  input: ListAiSummaryEventsAfterInput,
): Promise<AiSummaryEventRow[]> {
  const { rows } = await pool.query<AiSummaryEventRow>(
    `
      select
        event_id as "eventId",
        session_id as "sessionId",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
      from article_ai_summary_events
      where session_id = $1
        and event_id > $2
      order by event_id asc
    `,
    [input.sessionId, input.afterEventId],
  );
  return rows;
}
