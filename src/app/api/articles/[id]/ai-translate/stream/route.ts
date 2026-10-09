import { createEventStream, EVENT_STREAM_HEADERS, parseLastEventId } from '@/server/infra/http/eventStream';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getArticleById } from '@/server/domains/articles/repositories/articlesRepo';
import {
  getTranslationSessionByArticleId,
  listTranslationEventsAfter,
} from '@/server/domains/articles/repositories/articleTranslationRepo';

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

    const translationSession = await getTranslationSessionByArticleId(pool, articleId, session.userId);
    if (!translationSession) return fail(new NotFoundError('Translation session not found'));

    const initialAfterEventId = parseLastEventId(request.headers.get('last-event-id'));
    const initialEvents = await listTranslationEventsAfter(pool, {
      sessionId: translationSession.id,
      userId: translationSession.userId,
      afterEventId: initialAfterEventId,
    });
    const stream = createEventStream({
      signal: request.signal,
      afterEventId: initialAfterEventId,
      initialEvents,
      pollIntervalMs: 1000,
      sessionFinished: translationSession.status === 'succeeded' || translationSession.status === 'failed',
      listEvents: (afterEventId) => listTranslationEventsAfter(pool, {
        sessionId: translationSession.id,
        userId: translationSession.userId,
        afterEventId,
      }),
    });

    return new Response(stream, { headers: EVENT_STREAM_HEADERS });
  } catch (err) {
    return fail(err);
  }
}
