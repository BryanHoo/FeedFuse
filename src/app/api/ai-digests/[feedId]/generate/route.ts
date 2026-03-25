import { z } from 'zod';
import { resolveAiConfigFingerprints } from '../../../../../server/ai/configFingerprints';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getAiApiKey, getUiSettings } from '../../../../../server/repositories/settingsRepo';
import {
  createAiDigestRun,
  getAiDigestConfigByFeedId,
  getAiDigestRunByFeedIdAndWindowStartAt,
  updateAiDigestRun,
} from '../../../../../server/repositories/aiDigestRepo';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { JOB_AI_DIGEST_GENERATE } from '../../../../../server/queue/jobs';
import { writeUserOperationStartedLog } from '../../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  feedId: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ feedId: string }> },
) {
  try {
    const params = await context.params;
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsedParams.error)));
    }

    const pool = getPool();
    const [aiApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool),
      getUiSettings(pool),
    ]);
    if (!aiApiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }
    const { shared: sharedConfigFingerprint } = resolveAiConfigFingerprints({
      settings: uiSettings,
      aiApiKey,
      translationApiKey: '',
    });

    const feedId = parsedParams.data.feedId;
    const config = await getAiDigestConfigByFeedId(pool, feedId);
    if (!config) return fail(new NotFoundError('AI digest config not found'));

    const windowStartAt = config.lastWindowEndAt;
    const windowEndAt = new Date().toISOString();

    const existing = await getAiDigestRunByFeedIdAndWindowStartAt(pool, { feedId, windowStartAt });
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      await writeUserOperationStartedLog(pool, {
        actionKey: 'aiDigest.generate',
        source: 'app/api/ai-digests/[feedId]/generate',
        context: { feedId, runId: existing.id },
      });
      return ok({ enqueued: false, reason: 'already_running', runId: existing.id });
    }

    const created =
      (existing && existing.status === 'failed') ? existing : await createAiDigestRun(pool, {
        feedId,
        windowStartAt,
        windowEndAt,
        status: 'queued',
      });

    if (!created) {
      const again = await getAiDigestRunByFeedIdAndWindowStartAt(pool, { feedId, windowStartAt });
      if (again && (again.status === 'queued' || again.status === 'running')) {
        await writeUserOperationStartedLog(pool, {
          actionKey: 'aiDigest.generate',
          source: 'app/api/ai-digests/[feedId]/generate',
          context: { feedId, runId: again.id },
        });
        return ok({ enqueued: false, reason: 'already_running', runId: again.id });
      }
      if (!again) throw new Error('Failed to create or load ai digest run');
      // allow manual retry for failed
      if (again.status !== 'failed') {
        await writeUserOperationStartedLog(pool, {
          actionKey: 'aiDigest.generate',
          source: 'app/api/ai-digests/[feedId]/generate',
          context: { feedId, runId: again.id },
        });
        return ok({ enqueued: false, reason: 'already_running', runId: again.id });
      }
    }

    const runId = created
      ? created.id
      : (await getAiDigestRunByFeedIdAndWindowStartAt(pool, { feedId, windowStartAt }))!.id;

    const payload = { runId, sharedConfigFingerprint };
    const enqueueResult = await enqueueWithResult(
      JOB_AI_DIGEST_GENERATE,
      payload,
      getQueueSendOptions(JOB_AI_DIGEST_GENERATE, { runId }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_running', runId });
    }

    await updateAiDigestRun(pool, runId, {
      jobId: enqueueResult.jobId,
      status: 'queued',
      errorCode: null,
      errorMessage: null,
    });
    await writeUserOperationStartedLog(pool, {
      actionKey: 'aiDigest.generate',
      source: 'app/api/ai-digests/[feedId]/generate',
      context: { feedId, runId },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId, runId });
  } catch (err) {
    return fail(err);
  }
}
