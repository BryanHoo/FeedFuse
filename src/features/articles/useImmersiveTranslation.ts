import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createArticleAiTranslateEventSource,
  enqueueArticleAiTranslate,
  getArticleAiTranslateSnapshot,
  retryArticleAiTranslateSegment,
  type ArticleAiTranslateSegmentSnapshotDto,
  type ArticleAiTranslateSessionSnapshotDto,
  type TranslationSegmentStatus,
  type TranslationSessionStatus,
} from '../../lib/apiClient';

export interface ImmersiveTranslationApi {
  enqueueArticleAiTranslate: typeof enqueueArticleAiTranslate;
  getArticleAiTranslateSnapshot: typeof getArticleAiTranslateSnapshot;
  retryArticleAiTranslateSegment: typeof retryArticleAiTranslateSegment;
  createArticleAiTranslateEventSource: typeof createArticleAiTranslateEventSource;
}

interface UseImmersiveTranslationInput {
  articleId: string | null;
  api?: ImmersiveTranslationApi;
}

export interface UseImmersiveTranslationResult {
  viewing: boolean;
  loading: boolean;
  missingApiKey: boolean;
  waitingFulltext: boolean;
  timedOut: boolean;
  session: ArticleAiTranslateSessionSnapshotDto | null;
  segments: ArticleAiTranslateSegmentSnapshotDto[];
  requestTranslation: () => Promise<void>;
  retrySegment: (segmentIndex: number) => Promise<void>;
  setViewing: (value: boolean) => void;
}

interface SegmentPatch {
  segmentIndex: number;
  status?: TranslationSegmentStatus;
  sourceText?: string;
  translatedText?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  updatedAt?: string;
}

const defaultApi: ImmersiveTranslationApi = {
  enqueueArticleAiTranslate,
  getArticleAiTranslateSnapshot,
  retryArticleAiTranslateSegment,
  createArticleAiTranslateEventSource,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSortedSegments(
  segments: ArticleAiTranslateSegmentSnapshotDto[],
): ArticleAiTranslateSegmentSnapshotDto[] {
  return [...segments].sort((a, b) => a.segmentIndex - b.segmentIndex);
}

function applySegmentPatch(
  prev: ArticleAiTranslateSegmentSnapshotDto[],
  patch: SegmentPatch,
): ArticleAiTranslateSegmentSnapshotDto[] {
  const byIndex = new Map(prev.map((segment) => [segment.segmentIndex, segment]));
  const existing = byIndex.get(patch.segmentIndex);

  const next: ArticleAiTranslateSegmentSnapshotDto = {
    id: existing?.id ?? `segment-${patch.segmentIndex}`,
    segmentIndex: patch.segmentIndex,
    sourceText: patch.sourceText ?? existing?.sourceText ?? '',
    translatedText:
      patch.translatedText !== undefined
        ? patch.translatedText
        : (existing?.translatedText ?? null),
    status: patch.status ?? existing?.status ?? 'pending',
    errorCode: patch.errorCode !== undefined ? patch.errorCode : (existing?.errorCode ?? null),
    errorMessage:
      patch.errorMessage !== undefined ? patch.errorMessage : (existing?.errorMessage ?? null),
    updatedAt: patch.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
  };

  byIndex.set(patch.segmentIndex, next);
  return toSortedSegments(Array.from(byIndex.values()));
}

function parseEventPayload(event: Event): Record<string, unknown> {
  if (!(event instanceof MessageEvent)) return {};
  if (typeof event.data !== 'string') return {};

  try {
    const parsed: unknown = JSON.parse(event.data);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseSegmentIndex(payload: Record<string, unknown>): number | null {
  const value = payload.segmentIndex;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseSegmentStatus(
  value: unknown,
  fallback: TranslationSegmentStatus,
): TranslationSegmentStatus {
  if (value === 'pending' || value === 'running' || value === 'succeeded' || value === 'failed') {
    return value;
  }
  return fallback;
}

function parseSessionStatus(
  value: unknown,
  fallback: TranslationSessionStatus,
): TranslationSessionStatus {
  if (
    value === 'running' ||
    value === 'succeeded' ||
    value === 'partial_failed' ||
    value === 'failed'
  ) {
    return value;
  }
  return fallback;
}

export function useImmersiveTranslation(
  input: UseImmersiveTranslationInput,
): UseImmersiveTranslationResult {
  const api = useMemo(() => input.api ?? defaultApi, [input.api]);
  const [viewing, setViewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [missingApiKey, setMissingApiKey] = useState(false);
  const [waitingFulltext, setWaitingFulltext] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [session, setSession] = useState<ArticleAiTranslateSessionSnapshotDto | null>(null);
  const [segments, setSegments] = useState<ArticleAiTranslateSegmentSnapshotDto[]>([]);

  const articleIdRef = useRef<string | null>(input.articleId);
  const requestTokenRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const closeStream = useCallback(() => {
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const isCurrentRequest = useCallback((articleId: string, token: number): boolean => {
    return articleIdRef.current === articleId && requestTokenRef.current === token;
  }, []);

  const connectStream = useCallback(
    (articleId: string, token: number) => {
      if (!isCurrentRequest(articleId, token)) return;

      closeStream();
      const stream = api.createArticleAiTranslateEventSource(articleId);
      eventSourceRef.current = stream;

      const onSegmentRunning: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        const segmentIndex = parseSegmentIndex(payload);
        if (segmentIndex === null) return;
        setSegments((prev) =>
          applySegmentPatch(prev, {
            segmentIndex,
            status: parseSegmentStatus(payload.status, 'running'),
            updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : undefined,
          }),
        );
      };

      const onSegmentSucceeded: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        const segmentIndex = parseSegmentIndex(payload);
        if (segmentIndex === null) return;
        setSegments((prev) =>
          applySegmentPatch(prev, {
            segmentIndex,
            status: parseSegmentStatus(payload.status, 'succeeded'),
            translatedText:
              typeof payload.translatedText === 'string' ? payload.translatedText : null,
            errorCode: null,
            errorMessage: null,
            updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : undefined,
          }),
        );
      };

      const onSegmentFailed: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        const segmentIndex = parseSegmentIndex(payload);
        if (segmentIndex === null) return;
        setSegments((prev) =>
          applySegmentPatch(prev, {
            segmentIndex,
            status: parseSegmentStatus(payload.status, 'failed'),
            translatedText: null,
            errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : null,
            errorMessage: typeof payload.errorMessage === 'string' ? payload.errorMessage : null,
            updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : undefined,
          }),
        );
      };

      const onSessionCompleted: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        setSession((current) => {
          if (!current) return current;
          return {
            ...current,
            status: parseSessionStatus(payload.status, current.status),
            translatedSegments:
              typeof payload.translatedSegments === 'number'
                ? payload.translatedSegments
                : current.translatedSegments,
            failedSegments:
              typeof payload.failedSegments === 'number'
                ? payload.failedSegments
                : current.failedSegments,
            updatedAt: new Date().toISOString(),
          };
        });
        setLoading(false);
        closeStream();
      };

      const onSessionFailed: EventListener = () => {
        if (!isCurrentRequest(articleId, token)) return;
        setSession((current) => (current ? { ...current, status: 'failed' } : current));
        setLoading(false);
        closeStream();
      };

      stream.addEventListener('segment.running', onSegmentRunning);
      stream.addEventListener('segment.succeeded', onSegmentSucceeded);
      stream.addEventListener('segment.failed', onSegmentFailed);
      stream.addEventListener('session.completed', onSessionCompleted);
      stream.addEventListener('session.failed', onSessionFailed);

      streamCleanupRef.current = () => {
        stream.removeEventListener('segment.running', onSegmentRunning);
        stream.removeEventListener('segment.succeeded', onSegmentSucceeded);
        stream.removeEventListener('segment.failed', onSegmentFailed);
        stream.removeEventListener('session.completed', onSessionCompleted);
        stream.removeEventListener('session.failed', onSessionFailed);
      };
    },
    [api, closeStream, isCurrentRequest],
  );

  const loadSnapshot = useCallback(
    async (articleId: string, token: number) => {
      const snapshot = await api.getArticleAiTranslateSnapshot(articleId);
      if (!isCurrentRequest(articleId, token)) return null;

      setSession(snapshot.session);
      setSegments(toSortedSegments(snapshot.segments));

      if (snapshot.session?.status === 'running') {
        setLoading(true);
        connectStream(articleId, token);
      } else {
        setLoading(false);
        closeStream();
      }

      return snapshot;
    },
    [api, closeStream, connectStream, isCurrentRequest],
  );

  useEffect(() => {
    articleIdRef.current = input.articleId;
    requestTokenRef.current += 1;
    closeStream();
    setViewing(false);
    setLoading(false);
    setMissingApiKey(false);
    setWaitingFulltext(false);
    setTimedOut(false);
    setSession(null);
    setSegments([]);
  }, [input.articleId, closeStream]);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  const requestTranslation = useCallback(async () => {
    const articleId = input.articleId;
    if (!articleId) return;

    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;

    setMissingApiKey(false);
    setWaitingFulltext(false);
    setTimedOut(false);
    setLoading(true);

    try {
      const enqueueResult = await api.enqueueArticleAiTranslate(articleId);
      if (!isCurrentRequest(articleId, token)) return;

      if (enqueueResult.reason === 'missing_api_key') {
        setLoading(false);
        setMissingApiKey(true);
        return;
      }

      if (enqueueResult.reason === 'fulltext_pending') {
        setLoading(false);
        setWaitingFulltext(true);
        return;
      }

      if (enqueueResult.reason === 'body_translate_disabled') {
        setLoading(false);
        return;
      }

      if (enqueueResult.reason === 'already_translated') {
        setLoading(false);
        setViewing(true);
        return;
      }

      await loadSnapshot(articleId, token);
      if (!isCurrentRequest(articleId, token)) return;
      setViewing(true);
    } catch (err) {
      console.error(err);
      if (!isCurrentRequest(articleId, token)) return;
      setLoading(false);
    }
  }, [api, input.articleId, isCurrentRequest, loadSnapshot]);

  const retrySegment = useCallback(
    async (segmentIndex: number) => {
      const articleId = input.articleId;
      if (!articleId) return;

      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;

      setLoading(true);

      try {
        await api.retryArticleAiTranslateSegment(articleId, segmentIndex);
        if (!isCurrentRequest(articleId, token)) return;
        await loadSnapshot(articleId, token);
        if (!isCurrentRequest(articleId, token)) return;
        setViewing(true);
      } catch (err) {
        console.error(err);
        if (!isCurrentRequest(articleId, token)) return;
        setLoading(false);
      }
    },
    [api, input.articleId, isCurrentRequest, loadSnapshot],
  );

  return {
    viewing,
    loading,
    missingApiKey,
    waitingFulltext,
    timedOut,
    session,
    segments,
    requestTranslation,
    retrySegment,
    setViewing,
  };
}
