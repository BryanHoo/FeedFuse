import type { Pool } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

export type TranslationSessionStatus = 'running' | 'succeeded' | 'partial_failed' | 'failed';
export type TranslationSegmentStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface TranslationSessionRow {
  id: string;
  userId: string;
  articleId: string;
  sourceHtmlHash: string;
  status: TranslationSessionStatus;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  rawErrorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationSegmentRow {
  id: string;
  userId: string;
  sessionId: string;
  segmentIndex: number;
  sourceText: string;
  translatedText: string | null;
  status: TranslationSegmentStatus;
  errorCode: string | null;
  errorMessage: string | null;
  rawErrorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationEventRow {
  eventId: number | string;
  userId: string;
  sessionId: string;
  segmentIndex: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface UpsertTranslationSessionInput {
  userId?: string | null;
  articleId: string;
  sourceHtmlHash: string;
  status: TranslationSessionStatus;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  rawErrorMessage?: string | null;
}

export interface UpsertTranslationSegmentInput {
  userId?: string | null;
  sessionId: string;
  segmentIndex: number;
  sourceText: string;
  translatedText?: string | null;
  status: TranslationSegmentStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  rawErrorMessage?: string | null;
}

export interface InsertTranslationEventInput {
  userId?: string | null;
  sessionId: string;
  segmentIndex?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}

export async function getTranslationSessionByArticleId(
  pool: Pool,
  articleId: string,
  userId?: string | null,
): Promise<TranslationSessionRow | null> {
  const scopedUserId = normalizeUserId(userId);
  const { rows } = await pool.query<TranslationSessionRow>(
    `
      select
        id,
        user_id::text as "userId",
        article_id as "articleId",
        source_html_hash as "sourceHtmlHash",
        status,
        total_segments as "totalSegments",
        translated_segments as "translatedSegments",
        failed_segments as "failedSegments",
        raw_error_message as "rawErrorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from article_translation_sessions
      where article_id = $1 and user_id = $2
      limit 1
    `,
    [articleId, scopedUserId],
  );
  return rows[0] ?? null;
}

export async function upsertTranslationSession(
  pool: Pool,
  input: UpsertTranslationSessionInput,
): Promise<TranslationSessionRow> {
  const scopedUserId = normalizeUserId(input.userId);
  const { rows } = await pool.query<TranslationSessionRow>(
    `
      insert into article_translation_sessions (
        user_id,
        article_id,
        source_html_hash,
        status,
        total_segments,
        translated_segments,
        failed_segments,
        raw_error_message,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, now(), null, now(), now())
      on conflict (user_id, article_id) do update
      set
        source_html_hash = $3,
        status = $4,
        total_segments = $5,
        translated_segments = $6,
        failed_segments = $7,
        raw_error_message = $8,
        finished_at = case
          when $4 in ('succeeded', 'partial_failed', 'failed') then now()
          else null
        end,
        updated_at = now()
      returning
        id,
        user_id::text as "userId",
        article_id as "articleId",
        source_html_hash as "sourceHtmlHash",
        status,
        total_segments as "totalSegments",
        translated_segments as "translatedSegments",
        failed_segments as "failedSegments",
        raw_error_message as "rawErrorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      scopedUserId,
      input.articleId,
      input.sourceHtmlHash,
      input.status,
      input.totalSegments,
      input.translatedSegments,
      input.failedSegments,
      input.rawErrorMessage ?? null,
    ],
  );
  return rows[0] as TranslationSessionRow;
}

export async function listTranslationSegmentsBySessionId(
  pool: Pool,
  sessionId: string,
  userId?: string | null,
): Promise<TranslationSegmentRow[]> {
  const scopedUserId = normalizeUserId(userId);
  const { rows } = await pool.query<TranslationSegmentRow>(
    `
      select
        id,
        user_id::text as "userId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        source_text as "sourceText",
        translated_text as "translatedText",
        status,
        error_code as "errorCode",
        error_message as "errorMessage",
        raw_error_message as "rawErrorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from article_translation_segments
      where session_id = $1 and user_id = $2
      order by segment_index asc
    `,
    [sessionId, scopedUserId],
  );
  return rows;
}

export async function deleteTranslationSegmentsBySessionId(
  pool: Pool,
  sessionId: string,
  userId?: string | null,
): Promise<void> {
  const scopedUserId = normalizeUserId(userId);
  await pool.query(
    `
      delete from article_translation_segments
      where session_id = $1 and user_id = $2
    `,
    [sessionId, scopedUserId],
  );
}

export async function deleteTranslationEventsBySessionId(
  pool: Pool,
  sessionId: string,
  userId?: string | null,
): Promise<void> {
  const scopedUserId = normalizeUserId(userId);
  await pool.query(
    `
      delete from article_translation_events
      where session_id = $1 and user_id = $2
    `,
    [sessionId, scopedUserId],
  );
}

export async function upsertTranslationSegment(
  pool: Pool,
  input: UpsertTranslationSegmentInput,
): Promise<TranslationSegmentRow> {
  const scopedUserId = normalizeUserId(input.userId);
  const finishedAtSql =
    input.status === 'succeeded' || input.status === 'failed' ? 'now()' : 'null';
  const startedAtSql =
    input.status === 'running'
      ? 'coalesce(article_translation_segments.started_at, now())'
      : input.status === 'pending'
        ? 'null'
        : 'article_translation_segments.started_at';

  const { rows } = await pool.query<TranslationSegmentRow>(
    `
      insert into article_translation_segments (
        user_id,
        session_id,
        segment_index,
        source_text,
        translated_text,
        status,
        error_code,
        error_message,
        raw_error_message,
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
        case when $6 = 'running' then now() else null end,
        case when $6 in ('succeeded', 'failed') then now() else null end,
        now(),
        now()
      )
      on conflict (user_id, session_id, segment_index) do update
      set
        source_text = $4,
        translated_text = $5,
        status = $6,
        error_code = $7,
        error_message = $8,
        raw_error_message = $9,
        started_at = ${startedAtSql},
        finished_at = ${finishedAtSql},
        updated_at = now()
      returning
        id,
        user_id::text as "userId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        source_text as "sourceText",
        translated_text as "translatedText",
        status,
        error_code as "errorCode",
        error_message as "errorMessage",
        raw_error_message as "rawErrorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      scopedUserId,
      input.sessionId,
      input.segmentIndex,
      input.sourceText,
      input.translatedText ?? null,
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.rawErrorMessage ?? null,
    ],
  );
  return rows[0] as TranslationSegmentRow;
}

export async function insertTranslationEvent(
  pool: Pool,
  input: InsertTranslationEventInput,
): Promise<TranslationEventRow> {
  const scopedUserId = normalizeUserId(input.userId);
  const { rows } = await pool.query<TranslationEventRow>(
    `
      insert into article_translation_events (
        user_id,
        session_id,
        segment_index,
        event_type,
        payload,
        created_at
      )
      values ($1, $2, $3, $4, $5::jsonb, now())
      returning
        event_id as "eventId",
        user_id::text as "userId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
    `,
    [
      scopedUserId,
      input.sessionId,
      input.segmentIndex ?? null,
      input.eventType,
      JSON.stringify(input.payload ?? {}),
    ],
  );
  return rows[0] as TranslationEventRow;
}

export async function listTranslationEventsAfter(
  pool: Pool,
  input: { userId?: string | null; sessionId: string; afterEventId: number | string },
): Promise<TranslationEventRow[]> {
  const scopedUserId = normalizeUserId(input.userId);
  const { rows } = await pool.query<TranslationEventRow>(
    `
      select
        event_id as "eventId",
        user_id::text as "userId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
      from article_translation_events
      where session_id = $1 and user_id = $2 and event_id > $3
      order by event_id asc
      limit 200
    `,
    [input.sessionId, scopedUserId, input.afterEventId],
  );
  return rows;
}

// 事件只用于短期断线重放：完成七天后分批清理中间事件，保留终态用于旧客户端重连收尾。
export async function deleteExpiredTranslationEvents(
  pool: Pick<Pool, 'query'>,
  input: { userId: string },
): Promise<number> {
  const result = await pool.query(
    `
      delete from article_translation_events
      where user_id = $1 and event_id in (
        select e.event_id
        from article_translation_events e
        join article_translation_sessions s on s.id = e.session_id and s.user_id = e.user_id
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
