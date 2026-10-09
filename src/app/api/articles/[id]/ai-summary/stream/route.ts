import { createEventStream, EVENT_STREAM_HEADERS, parseLastEventId } from '@/server/infra/http/eventStream';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getArticleById } from '@/server/domains/articles/repositories/articlesRepo';
import {
  getActiveAiSummarySessionByArticleId,
  listAiSummaryEventsAfter,
} from '@/server/domains/articles/repositories/articleAiSummaryRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUMMARY_STREAM_REPLAY_INTERVAL_MS = 250;

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

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

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

    const article = await getArticleById(pool, articleId, session.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const summarySession = await getActiveAiSummarySessionByArticleId(pool, articleId, session.userId);
    if (!summarySession) return fail(new NotFoundError('Summary session not found'));

    const initialAfterEventId = parseLastEventId(request.headers.get('last-event-id'));
    const initialEvents = await listAiSummaryEventsAfter(pool, {
      sessionId: summarySession.id,
      userId: summarySession.userId,
      afterEventId: initialAfterEventId,
    });
    const stream = createEventStream({
      signal: request.signal,
      afterEventId: initialAfterEventId,
      initialEvents,
      pollIntervalMs: SUMMARY_STREAM_REPLAY_INTERVAL_MS,
      sessionFinished: summarySession.status === 'succeeded' || summarySession.status === 'failed',
      listEvents: (afterEventId) => listAiSummaryEventsAfter(pool, {
        sessionId: summarySession.id,
        userId: summarySession.userId,
        afterEventId,
      }),
    });

    return new Response(stream, { headers: EVENT_STREAM_HEADERS });
  } catch (err) {
    return fail(err);
  }
}
