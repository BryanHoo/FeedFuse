import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createArticleAiSummaryEventSource,
  enqueueArticleAiSummary,
  getArticleAiSummarySnapshot,
  type ArticleAiSummarySessionSnapshotDto,
} from '../../lib/apiClient';

export interface StreamingAiSummaryApi {
  enqueueArticleAiSummary: typeof enqueueArticleAiSummary;
  getArticleAiSummarySnapshot: typeof getArticleAiSummarySnapshot;
  createArticleAiSummaryEventSource: typeof createArticleAiSummaryEventSource;
}

interface UseStreamingAiSummaryInput {
  articleId: string | null;
  initialSession?: ArticleAiSummarySessionSnapshotDto | null;
  onCompleted?: (articleId: string) => Promise<void> | void;
  api?: StreamingAiSummaryApi;
}

export interface UseStreamingAiSummaryResult {
  loading: boolean;
  missingApiKey: boolean;
  waitingFulltext: boolean;
  session: ArticleAiSummarySessionSnapshotDto | null;
  requestSummary: (input?: { force?: boolean }) => Promise<void>;
  clearTransientState: () => void;
}

const defaultApi: StreamingAiSummaryApi = {
  enqueueArticleAiSummary,
  getArticleAiSummarySnapshot,
  createArticleAiSummaryEventSource,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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

export function useStreamingAiSummary(
  input: UseStreamingAiSummaryInput,
): UseStreamingAiSummaryResult {
  const api = useMemo(() => input.api ?? defaultApi, [input.api]);
  const [loading, setLoadingState] = useState(false);
  const [missingApiKey, setMissingApiKeyState] = useState(false);
  const [waitingFulltext, setWaitingFulltextState] = useState(false);
  const [session, setSessionState] = useState<ArticleAiSummarySessionSnapshotDto | null>(
    input.initialSession ?? null,
  );

  const articleIdRef = useRef<string | null>(input.articleId);
  const onCompletedRef = useRef(input.onCompleted);
  const initializedRef = useRef(false);
  const requestTokenRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onCompletedRef.current = input.onCompleted;
  }, [input.onCompleted]);

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
      const stream = api.createArticleAiSummaryEventSource(articleId);
      eventSourceRef.current = stream;

      const onSummaryDelta: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        const deltaText = typeof payload.deltaText === 'string' ? payload.deltaText : '';
        if (!deltaText) return;

        setSessionState((current) =>
          current
            ? {
                ...current,
                status: current.status === 'queued' ? 'running' : current.status,
                draftText: `${current.draftText}${deltaText}`,
                updatedAt: new Date().toISOString(),
              }
            : current,
        );
      };

      const onSummarySnapshot: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);
        if (typeof payload.draftText !== 'string') return;

        setSessionState((current) =>
          current
            ? {
                ...current,
                draftText: payload.draftText,
                updatedAt: new Date().toISOString(),
              }
            : current,
        );
      };

      const onSessionCompleted: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);

        setSessionState((current) => {
          if (!current) return current;
          const finalText =
            typeof payload.finalText === 'string' && payload.finalText.trim()
              ? payload.finalText
              : current.draftText;

          return {
            ...current,
            status: 'succeeded',
            draftText: finalText,
            finalText,
            errorCode: null,
            errorMessage: null,
            finishedAt: current.finishedAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        });
        setLoadingState(false);
        closeStream();
        void Promise.resolve(onCompletedRef.current?.(articleId)).catch((err) => {
          console.error(err);
        });
      };

      const onSessionFailed: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);

        setSessionState((current) =>
          current
            ? {
                ...current,
                status: 'failed',
                draftText:
                  typeof payload.draftText === 'string' ? payload.draftText : current.draftText,
                errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : null,
                errorMessage:
                  typeof payload.errorMessage === 'string' ? payload.errorMessage : null,
                finishedAt: current.finishedAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : current,
        );
        setLoadingState(false);
        closeStream();
      };

      stream.addEventListener('summary.delta', onSummaryDelta);
      stream.addEventListener('summary.snapshot', onSummarySnapshot);
      stream.addEventListener('session.completed', onSessionCompleted);
      stream.addEventListener('session.failed', onSessionFailed);

      streamCleanupRef.current = () => {
        stream.removeEventListener('summary.delta', onSummaryDelta);
        stream.removeEventListener('summary.snapshot', onSummarySnapshot);
        stream.removeEventListener('session.completed', onSessionCompleted);
        stream.removeEventListener('session.failed', onSessionFailed);
      };
    },
    [api, closeStream, isCurrentRequest],
  );

  const loadSnapshot = useCallback(
    async (articleId: string, token: number) => {
      const snapshot = await api.getArticleAiSummarySnapshot(articleId);
      if (!isCurrentRequest(articleId, token)) return null;

      setSessionState(snapshot.session);

      if (snapshot.session?.status === 'queued' || snapshot.session?.status === 'running') {
        setLoadingState(true);
        connectStream(articleId, token);
      } else {
        setLoadingState(false);
        closeStream();
      }

      return snapshot;
    },
    [api, closeStream, connectStream, isCurrentRequest],
  );

  useEffect(() => {
    articleIdRef.current = input.articleId;

    if (!initializedRef.current) {
      initializedRef.current = true;
      if (
        input.articleId &&
        input.initialSession &&
        (input.initialSession.status === 'queued' || input.initialSession.status === 'running') &&
        !eventSourceRef.current
      ) {
        const token = requestTokenRef.current;
        setSessionState(input.initialSession);
        setLoadingState(true);
        connectStream(input.articleId, token);
      }
      return;
    }

    requestTokenRef.current += 1;
    closeStream();
    setLoadingState(false);
    setMissingApiKeyState(false);
    setWaitingFulltextState(false);
    setSessionState(input.initialSession ?? null);

    if (
      input.articleId &&
      input.initialSession &&
      (input.initialSession.status === 'queued' || input.initialSession.status === 'running') &&
      !eventSourceRef.current
    ) {
      const token = requestTokenRef.current;
      setLoadingState(true);
      connectStream(input.articleId, token);
    }
  }, [closeStream, connectStream, input.articleId, input.initialSession]);

  useEffect(() => {
    return () => {
      closeStream();
    };
  }, [closeStream]);

  const requestSummary = useCallback(
    async (options?: { force?: boolean }) => {
      const articleId = input.articleId;
      if (!articleId) return;

      const token = requestTokenRef.current + 1;
      requestTokenRef.current = token;
      const force = Boolean(options?.force);

      setMissingApiKeyState(false);
      setWaitingFulltextState(false);
      setLoadingState(true);

      try {
        const enqueueResult = force
          ? await api.enqueueArticleAiSummary(articleId, { force: true })
          : await api.enqueueArticleAiSummary(articleId);
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

        if (enqueueResult.reason === 'already_summarized') {
          setLoadingState(false);
          closeStream();
          return;
        }

        if (enqueueResult.enqueued || enqueueResult.reason === 'already_enqueued') {
          await loadSnapshot(articleId, token);
          return;
        }

        setLoadingState(false);
      } catch (err) {
        console.error(err);
        if (!isCurrentRequest(articleId, token)) return;
        setLoadingState(false);
      }
    },
    [api, closeStream, input.articleId, isCurrentRequest, loadSnapshot],
  );

  const clearTransientState = useCallback(() => {
    setMissingApiKeyState(false);
    setWaitingFulltextState(false);
  }, []);

  return {
    loading,
    missingApiKey,
    waitingFulltext,
    session,
    requestSummary,
    clearTransientState,
  };
}
