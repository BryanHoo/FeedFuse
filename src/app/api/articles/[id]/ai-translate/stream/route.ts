import { z } from 'zod';
import { getPool } from '../../../../../../server/db/pool';
import { fail } from '../../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../../server/http/errors';
import { getArticleById } from '../../../../../../server/repositories/articlesRepo';
import {
  getTranslationSessionByArticleId,
  listTranslationEventsAfter,
  type TranslationEventRow,
} from '../../../../../../server/repositories/articleTranslationRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function parseLastEventId(headerValue: string | null): number {
  if (!headerValue) return 0;
  const parsed = Number.parseInt(headerValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function formatSseEvent(event: TranslationEventRow): string {
  return `id: ${event.eventId}\nevent: ${event.eventType}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

export async function GET(
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

    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const session = await getTranslationSessionByArticleId(pool, articleId);
    if (!session) return fail(new NotFoundError('Translation session not found'));

    const initialAfterEventId = parseLastEventId(request.headers.get('last-event-id'));
    let lastEventId = initialAfterEventId;
    const initialEvents = await listTranslationEventsAfter(pool, {
      sessionId: session.id,
      afterEventId: lastEventId,
    });
    if (initialEvents.length > 0) {
      lastEventId = initialEvents[initialEvents.length - 1].eventId;
    }

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const pushEvents = (events: TranslationEventRow[]) => {
          for (const event of events) {
            lastEventId = event.eventId;
            controller.enqueue(encoder.encode(formatSseEvent(event)));
          }
        };

        pushEvents(initialEvents);

        const replayTimer = setInterval(() => {
          void listTranslationEventsAfter(pool, {
            sessionId: session.id,
            afterEventId: lastEventId,
          })
            .then((events) => {
              pushEvents(events);
            })
            .catch(() => {
              // Keep stream alive for transient poll errors.
            });
        }, 1000);

        const heartbeatTimer = setInterval(() => {
          controller.enqueue(encoder.encode(': ping\n\n'));
        }, 15000);

        const onAbort = () => {
          clearInterval(replayTimer);
          clearInterval(heartbeatTimer);
          try {
            controller.close();
          } catch {
            // no-op
          }
        };

        cleanup = onAbort;

        if (request.signal.aborted) {
          onAbort();
          return;
        }
        request.signal.addEventListener('abort', onAbort, { once: true });
      },
      cancel() {
        cleanup();
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (err) {
    return fail(err);
  }
}
