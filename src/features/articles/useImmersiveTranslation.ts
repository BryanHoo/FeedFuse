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
  requestTranslation: (input?: { force?: boolean; autoView?: boolean }) => Promise<void>;
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
  const [viewing, setViewingState] = useState(false);
  const [loading, setLoadingState] = useState(false);
  const [missingApiKey, setMissingApiKeyState] = useState(false);
  const [waitingFulltext, setWaitingFulltextState] = useState(false);
  const [timedOut, setTimedOutState] = useState(false);
  const [session, setSessionState] = useState<ArticleAiTranslateSessionSnapshotDto | null>(null);
  const [segments, setSegmentsState] = useState<ArticleAiTranslateSegmentSnapshotDto[]>([]);

  const articleIdRef = useRef<string | null>(input.articleId);
  const [stateArticleId, setStateArticleId] = useState<string | null>(input.articleId);
  const requestTokenRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  const ensureStateForArticle = useCallback(
    (articleId: string | null) => {
      if (stateArticleId === articleId) return;
      setStateArticleId(articleId);
      setViewingState(false);
      setLoadingState(false);
      setMissingApiKeyState(false);
      setWaitingFulltextState(false);
      setTimedOutState(false);
      setSessionState(null);
      setSegmentsState([]);
    },
    [stateArticleId],
  );

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
        setSegmentsState((prev) =>
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
        setSegmentsState((prev) =>
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
        setSegmentsState((prev) =>
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
        setSessionState((current) => {
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
        setLoadingState(false);
        closeStream();
      };

      const onSessionFailed: EventListener = () => {
        if (!isCurrentRequest(articleId, token)) return;
        setSessionState((current) => (current ? { ...current, status: 'failed' } : current));
        setLoadingState(false);
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
      ensureStateForArticle(articleId);
      const snapshot = await api.getArticleAiTranslateSnapshot(articleId);
      if (!isCurrentRequest(articleId, token)) return null;

      setSessionState(snapshot.session);
      setSegmentsState(toSortedSegments(snapshot.segments));

      if (snapshot.session?.status === 'running') {
        setLoadingState(true);
        connectStream(articleId, token);
      } else {
        setLoadingState(false);
        closeStream();
      }

      return snapshot;
    },
    [api, closeStream, connectStream, ensureStateForArticle, isCurrentRequest],
  );

  useEffect(() => {
    articleIdRef.current = input.articleId;
    requestTokenRef.current += 1;
    closeStream();
  }, [input.articleId, closeStream]);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  const requestTranslation = useCallback(async (options?: { force?: boolean; autoView?: boolean }) => {
    const articleId = input.articleId;
    if (!articleId) return;

    const token = requestTokenRef.current + 1;
    requestTokenRef.current = token;
    const force = Boolean(options?.force);
    const autoView = options?.autoView ?? true;

    ensureStateForArticle(articleId);
    setMissingApiKeyState(false);
    setWaitingFulltextState(false);
    setTimedOutState(false);
    setLoadingState(true);

    try {
      const enqueueResult = await api.enqueueArticleAiTranslate(articleId, { force });
      if (!isCurrentRequest(articleId, token)) return;

      if (enqueueResult.reason === 'missing_api_key') {
        setLoadingState(false);
        setMissingApiKeyState(true);
        return;
      }

      if (enqueueResult.reason === 'fulltext_pending') {
        setLoadingState(false);
        setWaitingFulltextState(true);
        return;
      }

      if (enqueueResult.reason === 'body_translate_disabled') {
        setLoadingState(false);
        return;
      }

      if (enqueueResult.reason === 'source_is_simplified_chinese') {
        setLoadingState(false);
        return;
      }

      if (enqueueResult.reason === 'already_translated') {
        setLoadingState(false);
        if (autoView) {
          setViewingState(true);
        }
        return;
      }

      await loadSnapshot(articleId, token);
      if (!isCurrentRequest(articleId, token)) return;
      if (autoView) {
        setViewingState(true);
      }
    } catch (err) {
      console.error(err);
      if (!isCurrentRequest(articleId, token)) return;
      setLoadingState(false);
    }
  }, [api, ensureStateForArticle, input.articleId, isCurrentRequest, loadSnapshot]);

  const retrySegment = useCallback(
    async (segmentIndex: number) => {
      const articleId = input.articleId;
      if (!articleId) return;

      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;

      ensureStateForArticle(articleId);
      setLoadingState(true);

      try {
        await api.retryArticleAiTranslateSegment(articleId, segmentIndex);
        if (!isCurrentRequest(articleId, token)) return;
        await loadSnapshot(articleId, token);
        if (!isCurrentRequest(articleId, token)) return;
        setViewingState(true);
      } catch (err) {
        console.error(err);
        if (!isCurrentRequest(articleId, token)) return;
        setLoadingState(false);
      }
    },
    [api, ensureStateForArticle, input.articleId, isCurrentRequest, loadSnapshot],
  );

  const setViewing = useCallback(
    (value: boolean) => {
      ensureStateForArticle(input.articleId);
      setViewingState(value);
    },
    [ensureStateForArticle, input.articleId],
  );

  const isStateForCurrentArticle = stateArticleId === input.articleId;

  return {
    viewing: isStateForCurrentArticle ? viewing : false,
    loading: isStateForCurrentArticle ? loading : false,
    missingApiKey: isStateForCurrentArticle ? missingApiKey : false,
    waitingFulltext: isStateForCurrentArticle ? waitingFulltext : false,
    timedOut: isStateForCurrentArticle ? timedOut : false,
    session: isStateForCurrentArticle ? session : null,
    segments: isStateForCurrentArticle ? segments : [],
    requestTranslation,
    retrySegment,
    setViewing,
  };
}
