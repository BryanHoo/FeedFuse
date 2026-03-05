import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { getArticleById } from '../../../../../server/repositories/articlesRepo';
import { upsertTaskQueued } from '../../../../../server/repositories/articleTasksRepo';
import { getFeedFullTextOnOpenEnabled } from '../../../../../server/repositories/feedsRepo';
import { getAiApiKey } from '../../../../../server/repositories/settingsRepo';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { JOB_AI_SUMMARIZE } from '../../../../../server/queue/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});
const bodySchema = z.object({
  force: z.boolean().optional(),
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
  request: Request,
  context: { params: Promise<{ id: string }> },
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
    const pool = getPool();
    const bodyParsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const force = bodyParsed.success ? Boolean(bodyParsed.data.force) : false;

    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const aiApiKey = await getAiApiKey(pool);
    if (!aiApiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }

    if (!force && article.aiSummary && article.aiSummary.trim()) {
      return ok({ enqueued: false, reason: 'already_summarized' });
    }

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
    if (fullTextOnOpenEnabled === true && !article.contentFullHtml && !article.contentFullError) {
      return ok({ enqueued: false, reason: 'fulltext_pending' });
    }

    const enqueueResult = await enqueueWithResult(
      JOB_AI_SUMMARIZE,
      { articleId },
      getQueueSendOptions(JOB_AI_SUMMARIZE, { articleId }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued' });
    }

    await upsertTaskQueued(pool, {
      articleId,
      type: 'ai_summary',
      jobId: enqueueResult.jobId,
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId });
  } catch (err) {
    return fail(err);
  }
}
