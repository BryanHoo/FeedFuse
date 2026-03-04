import type { Pool } from 'pg';

export type TranslationSessionStatus = 'running' | 'succeeded' | 'partial_failed' | 'failed';
export type TranslationSegmentStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export interface TranslationSessionRow {
  id: string;
  articleId: string;
  sourceHtmlHash: string;
  status: TranslationSessionStatus;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
  startedAt: string;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationSegmentRow {
  id: string;
  sessionId: string;
  segmentIndex: number;
  sourceText: string;
  translatedText: string | null;
  status: TranslationSegmentStatus;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationEventRow {
  eventId: number;
  sessionId: string;
  segmentIndex: number | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface UpsertTranslationSessionInput {
  articleId: string;
  sourceHtmlHash: string;
  status: TranslationSessionStatus;
  totalSegments: number;
  translatedSegments: number;
  failedSegments: number;
}

export interface UpsertTranslationSegmentInput {
  sessionId: string;
  segmentIndex: number;
  sourceText: string;
  translatedText?: string | null;
  status: TranslationSegmentStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface InsertTranslationEventInput {
  sessionId: string;
  segmentIndex?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
}

export async function upsertTranslationSession(
  pool: Pool,
  input: UpsertTranslationSessionInput,
): Promise<TranslationSessionRow> {
  const { rows } = await pool.query<TranslationSessionRow>(
    `
      insert into article_translation_sessions (
        article_id,
        source_html_hash,
        status,
        total_segments,
        translated_segments,
        failed_segments,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, $6, now(), null, now(), now())
      on conflict (article_id) do update
      set
        source_html_hash = $2,
        status = $3,
        total_segments = $4,
        translated_segments = $5,
        failed_segments = $6,
        finished_at = case
          when $3 in ('succeeded', 'partial_failed', 'failed') then now()
          else null
        end,
        updated_at = now()
      returning
        id,
        article_id as "articleId",
        source_html_hash as "sourceHtmlHash",
        status,
        total_segments as "totalSegments",
        translated_segments as "translatedSegments",
        failed_segments as "failedSegments",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      input.articleId,
      input.sourceHtmlHash,
      input.status,
      input.totalSegments,
      input.translatedSegments,
      input.failedSegments,
    ],
  );
  return rows[0] as TranslationSessionRow;
}

export async function listTranslationSegmentsBySessionId(
  pool: Pool,
  sessionId: string,
): Promise<TranslationSegmentRow[]> {
  const { rows } = await pool.query<TranslationSegmentRow>(
    `
      select
        id,
        session_id as "sessionId",
        segment_index as "segmentIndex",
        source_text as "sourceText",
        translated_text as "translatedText",
        status,
        error_code as "errorCode",
        error_message as "errorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from article_translation_segments
      where session_id = $1
      order by segment_index asc
    `,
    [sessionId],
  );
  return rows;
}

export async function upsertTranslationSegment(
  pool: Pool,
  input: UpsertTranslationSegmentInput,
): Promise<TranslationSegmentRow> {
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
        session_id,
        segment_index,
        source_text,
        translated_text,
        status,
        error_code,
        error_message,
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
        case when $5 = 'running' then now() else null end,
        case when $5 in ('succeeded', 'failed') then now() else null end,
        now(),
        now()
      )
      on conflict (session_id, segment_index) do update
      set
        source_text = $3,
        translated_text = $4,
        status = $5,
        error_code = $6,
        error_message = $7,
        started_at = ${startedAtSql},
        finished_at = ${finishedAtSql},
        updated_at = now()
      returning
        id,
        session_id as "sessionId",
        segment_index as "segmentIndex",
        source_text as "sourceText",
        translated_text as "translatedText",
        status,
        error_code as "errorCode",
        error_message as "errorMessage",
        started_at as "startedAt",
        finished_at as "finishedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `,
    [
      input.sessionId,
      input.segmentIndex,
      input.sourceText,
      input.translatedText ?? null,
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
    ],
  );
  return rows[0] as TranslationSegmentRow;
}

export async function insertTranslationEvent(
  pool: Pool,
  input: InsertTranslationEventInput,
): Promise<TranslationEventRow> {
  const { rows } = await pool.query<TranslationEventRow>(
    `
      insert into article_translation_events (
        session_id,
        segment_index,
        event_type,
        payload,
        created_at
      )
      values ($1, $2, $3, $4::jsonb, now())
      returning
        event_id as "eventId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
    `,
    [input.sessionId, input.segmentIndex ?? null, input.eventType, JSON.stringify(input.payload ?? {})],
  );
  return rows[0] as TranslationEventRow;
}

export async function listTranslationEventsAfter(
  pool: Pool,
  input: { sessionId: string; afterEventId: number },
): Promise<TranslationEventRow[]> {
  const { rows } = await pool.query<TranslationEventRow>(
    `
      select
        event_id as "eventId",
        session_id as "sessionId",
        segment_index as "segmentIndex",
        event_type as "eventType",
        payload,
        created_at as "createdAt"
      from article_translation_events
      where session_id = $1 and event_id > $2
      order by event_id asc
    `,
    [input.sessionId, input.afterEventId],
  );
  return rows;
}
