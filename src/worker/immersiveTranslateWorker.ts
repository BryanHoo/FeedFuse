import type { Pool } from 'pg';
import {
  getTranslationSessionByArticleId,
  insertTranslationEvent,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
  upsertTranslationSession,
  type TranslationSegmentRow,
  type TranslationSessionRow,
} from '../server/repositories/articleTranslationRepo';
import { mapTaskError } from '../server/tasks/errorMapping';

const DEFAULT_CONCURRENCY = 3;

interface TranslateTextInput {
  articleId: string;
  sessionId: string;
  segmentIndex: number;
  sourceText: string;
}

type TranslateTextFn = (input: TranslateTextInput) => Promise<string>;

interface ImmersiveTranslateDeps {
  getTranslationSessionByArticleId: typeof getTranslationSessionByArticleId;
  listTranslationSegmentsBySessionId: typeof listTranslationSegmentsBySessionId;
  upsertTranslationSegment: typeof upsertTranslationSegment;
  upsertTranslationSession: typeof upsertTranslationSession;
  insertTranslationEvent: typeof insertTranslationEvent;
}

export interface RunImmersiveTranslateSessionInput {
  pool: Pool;
  articleId: string;
  sessionId?: string | null;
  segmentIndex?: number | null;
  concurrency?: number;
  translateText: TranslateTextFn;
  deps?: Partial<ImmersiveTranslateDeps>;
}

interface SegmentCounts {
  translatedSegments: number;
  failedSegments: number;
}

const defaultDeps: ImmersiveTranslateDeps = {
  getTranslationSessionByArticleId,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
  upsertTranslationSession,
  insertTranslationEvent,
};

function resolveDeps(overrides: Partial<ImmersiveTranslateDeps> | undefined): ImmersiveTranslateDeps {
  return {
    ...defaultDeps,
    ...(overrides ?? {}),
  };
}

function toSegmentCounts(segments: TranslationSegmentRow[]): SegmentCounts {
  let translatedSegments = 0;
  let failedSegments = 0;

  for (const segment of segments) {
    if (segment.status === 'succeeded') translatedSegments += 1;
    if (segment.status === 'failed') failedSegments += 1;
  }

  return { translatedSegments, failedSegments };
}

function toSafeConcurrency(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.floor(value));
}

function pickTargetSegments(
  segments: TranslationSegmentRow[],
  segmentIndex: number | null,
): TranslationSegmentRow[] {
  if (segmentIndex !== null) {
    return segments.filter((segment) => segment.segmentIndex === segmentIndex);
  }

  return segments.filter((segment) => segment.status !== 'succeeded');
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;

  let cursor = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= items.length) return;
      await fn(items[currentIndex]);
    }
  });

  await Promise.all(workers);
}

async function processSegment(input: {
  pool: Pool;
  articleId: string;
  session: TranslationSessionRow;
  segment: TranslationSegmentRow;
  translateText: TranslateTextFn;
  deps: ImmersiveTranslateDeps;
}): Promise<void> {
  const { pool, articleId, session, segment, translateText, deps } = input;

  await deps.upsertTranslationSegment(pool, {
    sessionId: session.id,
    segmentIndex: segment.segmentIndex,
    sourceText: segment.sourceText,
    translatedText: null,
    status: 'running',
    errorCode: null,
    errorMessage: null,
  });
  await deps.insertTranslationEvent(pool, {
    sessionId: session.id,
    segmentIndex: segment.segmentIndex,
    eventType: 'segment.running',
    payload: {
      segmentIndex: segment.segmentIndex,
      status: 'running',
    },
  });

  try {
    const translatedText = await translateText({
      articleId,
      sessionId: session.id,
      segmentIndex: segment.segmentIndex,
      sourceText: segment.sourceText,
    });

    await deps.upsertTranslationSegment(pool, {
      sessionId: session.id,
      segmentIndex: segment.segmentIndex,
      sourceText: segment.sourceText,
      translatedText,
      status: 'succeeded',
      errorCode: null,
      errorMessage: null,
    });
    await deps.insertTranslationEvent(pool, {
      sessionId: session.id,
      segmentIndex: segment.segmentIndex,
      eventType: 'segment.succeeded',
      payload: {
        segmentIndex: segment.segmentIndex,
        status: 'succeeded',
        translatedText,
      },
    });
  } catch (err) {
    const mapped = mapTaskError({ type: 'ai_translate', err });
    await deps.upsertTranslationSegment(pool, {
      sessionId: session.id,
      segmentIndex: segment.segmentIndex,
      sourceText: segment.sourceText,
      translatedText: null,
      status: 'failed',
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    });
    await deps.insertTranslationEvent(pool, {
      sessionId: session.id,
      segmentIndex: segment.segmentIndex,
      eventType: 'segment.failed',
      payload: {
        segmentIndex: segment.segmentIndex,
        status: 'failed',
        errorCode: mapped.errorCode,
        errorMessage: mapped.errorMessage,
      },
    });
  }
}

export async function runImmersiveTranslateSession(
  input: RunImmersiveTranslateSessionInput,
): Promise<TranslationSessionRow> {
  const deps = resolveDeps(input.deps);
  const targetSegmentIndex =
    typeof input.segmentIndex === 'number' && Number.isInteger(input.segmentIndex)
      ? input.segmentIndex
      : null;
  const concurrency = toSafeConcurrency(input.concurrency);

  let session: TranslationSessionRow | null = null;

  try {
    session = await deps.getTranslationSessionByArticleId(input.pool, input.articleId);
    if (!session) {
      throw new Error('Translation session not found');
    }
    if (input.sessionId && session.id !== input.sessionId) {
      throw new Error('Translation session mismatch');
    }

    const initialSegments = await deps.listTranslationSegmentsBySessionId(input.pool, session.id);
    const initialCounts = toSegmentCounts(initialSegments);

    session = await deps.upsertTranslationSession(input.pool, {
      articleId: input.articleId,
      sourceHtmlHash: session.sourceHtmlHash,
      status: 'running',
      totalSegments: initialSegments.length,
      translatedSegments: initialCounts.translatedSegments,
      failedSegments: initialCounts.failedSegments,
    });
    const activeSession = session;
    await deps.insertTranslationEvent(input.pool, {
      sessionId: activeSession.id,
      segmentIndex: targetSegmentIndex,
      eventType: 'session.started',
      payload: {
        articleId: input.articleId,
        sessionId: activeSession.id,
        segmentIndex: targetSegmentIndex,
      },
    });

    const targetSegments = pickTargetSegments(initialSegments, targetSegmentIndex);
    if (targetSegmentIndex !== null && targetSegments.length === 0) {
      throw new Error('Translation segment not found');
    }

    await runWithConcurrency(targetSegments, concurrency, async (segment) => {
      await processSegment({
        pool: input.pool,
        articleId: input.articleId,
        session: activeSession,
        segment,
        translateText: input.translateText,
        deps,
      });
    });

    const finalSegments = await deps.listTranslationSegmentsBySessionId(input.pool, activeSession.id);
    const finalCounts = toSegmentCounts(finalSegments);
    const finalStatus = finalCounts.failedSegments > 0 ? 'partial_failed' : 'succeeded';

    const updatedSession = await deps.upsertTranslationSession(input.pool, {
      articleId: input.articleId,
      sourceHtmlHash: activeSession.sourceHtmlHash,
      status: finalStatus,
      totalSegments: finalSegments.length,
      translatedSegments: finalCounts.translatedSegments,
      failedSegments: finalCounts.failedSegments,
    });
    await deps.insertTranslationEvent(input.pool, {
      sessionId: activeSession.id,
      eventType: 'session.completed',
      payload: {
        status: updatedSession.status,
        translatedSegments: updatedSession.translatedSegments,
        failedSegments: updatedSession.failedSegments,
      },
    });

    return updatedSession;
  } catch (err) {
    if (session) {
      try {
        const segments = await deps.listTranslationSegmentsBySessionId(input.pool, session.id);
        const counts = toSegmentCounts(segments);
        const failedSession = await deps.upsertTranslationSession(input.pool, {
          articleId: input.articleId,
          sourceHtmlHash: session.sourceHtmlHash,
          status: 'failed',
          totalSegments: segments.length,
          translatedSegments: counts.translatedSegments,
          failedSegments: counts.failedSegments,
        });
        const mapped = mapTaskError({ type: 'ai_translate', err });
        await deps.insertTranslationEvent(input.pool, {
          sessionId: failedSession.id,
          eventType: 'session.failed',
          payload: {
            errorCode: mapped.errorCode,
            errorMessage: mapped.errorMessage,
          },
        });
      } catch {
        // Keep the original worker failure.
      }
    }

    throw err;
  }
}
