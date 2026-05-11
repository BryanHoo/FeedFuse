import { requireApiSession } from '@/server/auth/session';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import {
  createPrivateFmEpisode,
  getPrivateFmEpisodeByArticleId,
  markPrivateFmEpisodeFailed,
  type PrivateFmEpisodeRow,
} from '../../../../../server/repositories/privateFmRepo';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { JOB_PRIVATE_FM_GENERATE } from '../../../../../server/queue/jobs';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});
const PRIVATE_FM_PENDING_STALE_MS = 10 * 60 * 1000;
const PRIVATE_FM_RETRY_COOLDOWN_MS = 30 * 1000;

const generateBodySchema = z.object({
  mode: z.enum(['retry', 'regenerate']).optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function toEpisodeDto(episode: Awaited<ReturnType<typeof getPrivateFmEpisodeByArticleId>>) {
  if (!episode) return null;
  return {
    id: episode.id,
    status: episode.status,
    scriptText: episode.scriptText,
    audioUrl: episode.mergedAudioPath
      ? `/api/private-fm/episodes/${encodeURIComponent(episode.id)}/audio/full`
      : null,
    audioParts: episode.audioPaths.map((_, index) => ({
      index,
      url: `/api/private-fm/episodes/${encodeURIComponent(episode.id)}/audio/${index}`,
    })),
    errorCode: episode.errorCode,
    errorMessage: episode.errorMessage,
    updatedAt: episode.updatedAt,
  };
}

async function loadDigestRunForArticle(articleId: string): Promise<{ runId: string } | null> {
  const { rows } = await getPool().query<{ runId: string }>(
    `
      select r.id as "runId"
      from ai_digest_runs r
      join feeds f on f.id = r.feed_id
      where r.article_id = $1 and f.kind = 'ai_digest'
      order by r.created_at desc
      limit 1
    `,
    [articleId],
  );
  return rows[0] ?? null;
}

async function parseGenerateBody(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  return generateBodySchema.safeParse(body);
}

function isPrivateFmEpisodePending(episode: PrivateFmEpisodeRow | null): episode is PrivateFmEpisodeRow {
  return episode?.status === 'queued' || episode?.status === 'running' || episode?.status === 'script_ready';
}

function isPrivateFmEpisodeStale(episode: PrivateFmEpisodeRow): boolean {
  const updatedAtMs = new Date(episode.updatedAt).getTime();
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > PRIVATE_FM_PENDING_STALE_MS;
}

function isPrivateFmRetryCoolingDown(episode: PrivateFmEpisodeRow): boolean {
  if (episode.status !== 'failed') return false;
  const updatedAtMs = new Date(episode.updatedAt).getTime();
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < PRIVATE_FM_RETRY_COOLDOWN_MS;
}

function resolvePrivateFmCreateMode(
  requestedMode: 'retry' | 'regenerate',
  existing: PrivateFmEpisodeRow | null,
): 'retry' | 'regenerate' {
  if (requestedMode !== 'regenerate') return 'retry';
  return existing?.status === 'succeeded' ? 'regenerate' : 'retry';
}

function resolvePrivateFmInitialStatus(
  mode: 'retry' | 'regenerate',
  existing: PrivateFmEpisodeRow | null,
): 'queued' | 'script_ready' {
  if (mode === 'retry' && existing?.scriptText?.trim()) {
    return 'script_ready';
  }
  return 'queued';
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }
    const episode = await getPrivateFmEpisodeByArticleId(getPool(), parsed.data.id);
    return ok({ episode: toEpisodeDto(episode) });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }
    const body = await parseGenerateBody(request);
    if (!body.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(body.error)));
    }

    const pool = getPool();
    const articleId = parsed.data.id;
    const run = await loadDigestRunForArticle(articleId);
    if (!run) return fail(new NotFoundError('AI digest run not found'));

    const requestedMode = body.data.mode ?? 'retry';
    const existing = await getPrivateFmEpisodeByArticleId(pool, articleId);
    if (isPrivateFmEpisodePending(existing) && !isPrivateFmEpisodeStale(existing)) {
      return ok({ enqueued: false, reason: 'already_running', episodeId: existing.id });
    }
    if (existing && isPrivateFmRetryCoolingDown(existing)) {
      return ok({ enqueued: false, reason: 'retry_cooldown', episodeId: existing.id });
    }

    if (existing?.status === 'succeeded' && !existing.mergedAudioPath && existing.audioPaths.length > 0) {
      const enqueueResult = await enqueueWithResult(
        JOB_PRIVATE_FM_GENERATE,
        { episodeId: existing.id },
        getQueueSendOptions(JOB_PRIVATE_FM_GENERATE, { episodeId: existing.id }),
      );
      return ok({
        enqueued: enqueueResult.status === 'enqueued',
        reason: enqueueResult.status === 'enqueued' ? undefined : 'enqueue_failed',
        jobId: enqueueResult.status === 'enqueued' ? enqueueResult.jobId : undefined,
        episodeId: existing.id,
      });
    }

    const mode = resolvePrivateFmCreateMode(requestedMode, existing);
    const initialStatus = resolvePrivateFmInitialStatus(mode, existing);
    const episode = await createPrivateFmEpisode(pool, {
      articleId,
      runId: run.runId,
      status: initialStatus,
      mode,
    });
    const enqueueResult = await enqueueWithResult(
      JOB_PRIVATE_FM_GENERATE,
      { episodeId: episode.id },
      getQueueSendOptions(JOB_PRIVATE_FM_GENERATE, { episodeId: episode.id }),
    );
    if (enqueueResult.status === 'enqueued') {
      await createPrivateFmEpisode(pool, {
        articleId,
        runId: run.runId,
        status: initialStatus,
        jobId: enqueueResult.jobId,
        mode,
      });
      return ok({ enqueued: true, jobId: enqueueResult.jobId, episodeId: episode.id });
    }

    await markPrivateFmEpisodeFailed(pool, episode.id, {
      errorCode: 'private_fm_enqueue_failed',
      errorMessage: '私人 FM 任务入队失败，请稍后重试',
    });
    return ok({ enqueued: false, reason: 'enqueue_failed', episodeId: episode.id });
  } catch (err) {
    return fail(err);
  }
}
