import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export type PrivateFmEpisodeStatus = 'queued' | 'running' | 'script_ready' | 'succeeded' | 'failed';
export type PrivateFmEpisodeCreateMode = 'retry' | 'regenerate';

export interface PrivateFmEpisodeRow {
  id: string;
  articleId: string;
  runId: string;
  status: PrivateFmEpisodeStatus;
  scriptText: string | null;
  audioPaths: string[];
  mergedAudioPath: string | null;
  ttsModel: string | null;
  voice: string | null;
  responseFormat: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

const privateFmEpisodeColumnsSql = `
  id,
  article_id as "articleId",
  run_id as "runId",
  status,
  script_text as "scriptText",
  audio_paths as "audioPaths",
  merged_audio_path as "mergedAudioPath",
  tts_model as "ttsModel",
  voice,
  response_format as "responseFormat",
  error_code as "errorCode",
  error_message as "errorMessage",
  job_id as "jobId",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export async function createPrivateFmEpisode(
  db: DbClient,
  input: {
    articleId: string;
    runId: string;
    status: PrivateFmEpisodeStatus;
    jobId?: string | null;
    mode?: PrivateFmEpisodeCreateMode;
  },
): Promise<PrivateFmEpisodeRow> {
  const { rows } = await db.query<PrivateFmEpisodeRow>(
    `
      insert into private_fm_episodes(article_id, run_id, status, job_id)
      values ($1::bigint, $2::bigint, $3, $4)
      on conflict (article_id) do update
      set
        status = excluded.status,
        job_id = excluded.job_id,
        script_text = case
          when $5 = 'regenerate' then null
          else private_fm_episodes.script_text
        end,
        audio_paths = '{}'::text[],
        merged_audio_path = null,
        tts_model = null,
        voice = null,
        response_format = null,
        error_code = null,
        error_message = null,
        updated_at = now()
      returning ${privateFmEpisodeColumnsSql}
    `,
    [input.articleId, input.runId, input.status, input.jobId ?? null, input.mode ?? 'retry'],
  );
  return rows[0];
}

export async function getPrivateFmEpisodeById(
  db: DbClient,
  episodeId: string,
): Promise<PrivateFmEpisodeRow | null> {
  const { rows } = await db.query<PrivateFmEpisodeRow>(
    `
      select ${privateFmEpisodeColumnsSql}
      from private_fm_episodes
      where id = $1
      limit 1
    `,
    [episodeId],
  );
  return rows[0] ?? null;
}

export async function getPrivateFmEpisodeByArticleId(
  db: DbClient,
  articleId: string,
): Promise<PrivateFmEpisodeRow | null> {
  const { rows } = await db.query<PrivateFmEpisodeRow>(
    `
      select ${privateFmEpisodeColumnsSql}
      from private_fm_episodes
      where article_id = $1
      limit 1
    `,
    [articleId],
  );
  return rows[0] ?? null;
}

export async function getPrivateFmEpisodeByRunId(
  db: DbClient,
  runId: string,
): Promise<PrivateFmEpisodeRow | null> {
  const { rows } = await db.query<PrivateFmEpisodeRow>(
    `
      select ${privateFmEpisodeColumnsSql}
      from private_fm_episodes
      where run_id = $1
      order by updated_at desc, id desc
      limit 1
    `,
    [runId],
  );
  return rows[0] ?? null;
}

export async function markPrivateFmEpisodeRunning(
  db: DbClient,
  episodeId: string,
  input?: { jobId?: string | null },
): Promise<void> {
  await db.query(
    `
      update private_fm_episodes
      set
        status = 'running',
        job_id = coalesce($2, job_id),
        error_code = null,
        error_message = null,
        updated_at = now()
      where id = $1
    `,
    [episodeId, input?.jobId ?? null],
  );
}

export async function markPrivateFmEpisodeScriptReady(
  db: DbClient,
  episodeId: string,
  input: { scriptText: string },
): Promise<void> {
  await db.query(
    `
      update private_fm_episodes
      set
        status = 'script_ready',
        script_text = $2,
        error_code = null,
        error_message = null,
        updated_at = now()
      where id = $1
    `,
    [episodeId, input.scriptText],
  );
}

export async function markPrivateFmEpisodeSucceeded(
  db: DbClient,
  episodeId: string,
  input: {
    scriptText: string;
    audioPaths: string[];
    mergedAudioPath: string | null;
    ttsModel: string;
    voice: string;
    responseFormat: string;
  },
): Promise<void> {
  await db.query(
    `
      update private_fm_episodes
      set
        status = $2,
        script_text = $3,
        audio_paths = $4::text[],
        merged_audio_path = $5,
        tts_model = $6,
        voice = $7,
        response_format = $8,
        error_code = null,
        error_message = null,
        updated_at = now()
      where id = $1
    `,
    [
      episodeId,
      'succeeded',
      input.scriptText,
      input.audioPaths,
      input.mergedAudioPath,
      input.ttsModel,
      input.voice,
      input.responseFormat,
    ],
  );
}

export async function markPrivateFmEpisodeFailed(
  db: DbClient,
  episodeId: string,
  input: { errorCode: string; errorMessage: string },
): Promise<void> {
  await db.query(
    `
      update private_fm_episodes
      set
        status = 'failed',
        error_code = $2,
        error_message = $3,
        updated_at = now()
      where id = $1
    `,
    [episodeId, input.errorCode, input.errorMessage],
  );
}
