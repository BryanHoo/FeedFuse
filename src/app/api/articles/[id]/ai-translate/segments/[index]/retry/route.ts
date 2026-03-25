import { z } from 'zod';
import { getPool } from '../../../../../../../../server/db/pool';
import { ok, fail } from '../../../../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../../../../server/http/idSchemas';
import { getArticleById } from '../../../../../../../../server/repositories/articlesRepo';
import {
  getTranslationSessionByArticleId,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
} from '../../../../../../../../server/repositories/articleTranslationRepo';
import { writeUserOperationStartedLog } from '../../../../../../../../server/logging/userOperationLogger';
import { getQueueSendOptions } from '../../../../../../../../server/queue/contracts';
import { JOB_AI_TRANSLATE } from '../../../../../../../../server/queue/jobs';
import { enqueueWithResult } from '../../../../../../../../server/queue/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
  index: z.coerce.number().int().nonnegative(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; index: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const articleId = paramsParsed.data.id;
    const segmentIndex = paramsParsed.data.index;
    const pool = getPool();

    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const session = await getTranslationSessionByArticleId(pool, articleId);
    if (!session) return fail(new NotFoundError('Translation session not found'));

    const segments = await listTranslationSegmentsBySessionId(pool, session.id);
    const segment = segments.find((item) => item.segmentIndex === segmentIndex);
    if (!segment) return fail(new NotFoundError('Translation segment not found'));

    if (segment.status === 'succeeded') {
      return ok({ enqueued: false, reason: 'already_succeeded' });
    }

    if (segment.status !== 'failed') {
      return ok({ enqueued: false, reason: 'segment_not_failed' });
    }

    await upsertTranslationSegment(pool, {
      sessionId: session.id,
      segmentIndex,
      sourceText: segment.sourceText,
      translatedText: null,
      status: 'pending',
      errorCode: null,
      errorMessage: null,
    });

    const enqueueResult = await enqueueWithResult(
      JOB_AI_TRANSLATE,
      { articleId, sessionId: session.id, segmentIndex },
      getQueueSendOptions(JOB_AI_TRANSLATE, { articleId, force: true }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued' });
    }

    await writeUserOperationStartedLog(pool, {
      actionKey: 'article.aiTranslate.retrySegment',
      source: 'app/api/articles/[id]/ai-translate/segments/[index]/retry',
      context: {
        articleId,
        sessionId: session.id,
        segmentIndex,
        jobId: enqueueResult.jobId,
      },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId });
  } catch (err) {
    return fail(err);
  }
}
