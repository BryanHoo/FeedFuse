import { requireApiSession } from '@/server/auth/session';
import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { numericIdSchema } from '../../../../../server/http/idSchemas';
import { getArticleById } from '../../../../../server/repositories/articlesRepo';
import { getArticleTasksByArticleId } from '../../../../../server/repositories/articleTasksRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function idleTask(type: 'fulltext' | 'ai_summary' | 'ai_translate') {
  return {
    type,
    status: 'idle' as const,
    jobId: null as string | null,
    requestedAt: null as string | null,
    startedAt: null as string | null,
    finishedAt: null as string | null,
    attempts: 0,
    errorCode: null as string | null,
    errorMessage: null as string | null,
    rawErrorMessage: null as string | null,
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const pool = getPool();
    const article = await getArticleById(pool, paramsParsed.data.id);
    if (!article) return fail(new NotFoundError('Article not found'));

    const rows = await getArticleTasksByArticleId(pool, paramsParsed.data.id);
    const byType = new Map(rows.map((row) => [row.type, row]));

    const fulltext = byType.get('fulltext');
    const aiSummary = byType.get('ai_summary');
    const aiTranslate = byType.get('ai_translate');

    const data = {
      fulltext: fulltext
        ? {
            type: fulltext.type,
            status: fulltext.status,
            jobId: fulltext.jobId,
            requestedAt: fulltext.requestedAt,
            startedAt: fulltext.startedAt,
            finishedAt: fulltext.finishedAt,
            attempts: fulltext.attempts,
            errorCode: fulltext.errorCode,
            errorMessage: fulltext.errorMessage,
            rawErrorMessage: fulltext.rawErrorMessage,
          }
        : idleTask('fulltext'),
      ai_summary: aiSummary
        ? {
            type: aiSummary.type,
            status: aiSummary.status,
            jobId: aiSummary.jobId,
            requestedAt: aiSummary.requestedAt,
            startedAt: aiSummary.startedAt,
            finishedAt: aiSummary.finishedAt,
            attempts: aiSummary.attempts,
            errorCode: aiSummary.errorCode,
            errorMessage: aiSummary.errorMessage,
            rawErrorMessage: aiSummary.rawErrorMessage,
          }
        : idleTask('ai_summary'),
      ai_translate: aiTranslate
        ? {
            type: aiTranslate.type,
            status: aiTranslate.status,
            jobId: aiTranslate.jobId,
            requestedAt: aiTranslate.requestedAt,
            startedAt: aiTranslate.startedAt,
            finishedAt: aiTranslate.finishedAt,
            attempts: aiTranslate.attempts,
            errorCode: aiTranslate.errorCode,
            errorMessage: aiTranslate.errorMessage,
            rawErrorMessage: aiTranslate.rawErrorMessage,
          }
        : idleTask('ai_translate'),
    };

    return ok(data);
  } catch (err) {
    return fail(err);
  }
}
