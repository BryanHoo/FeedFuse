import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createArticleAiSummaryEventSource,
  enqueueArticleAiSummary,
  getArticleAiSummarySnapshot,
  type ArticleAiSummarySessionSnapshotDto,
} from '../../lib/apiClient';
import { parseEventPayload } from '../../lib/utils';

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
const SUMMARY_STREAM_TIMEOUT_MS = 60_000;

function getUpdatedAtMs(session: { updatedAt?: string | null } | null): number {
  const updatedAt = session?.updatedAt;
  if (!updatedAt) return 0;
  const parsed = Date.parse(updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isPendingSession(session: ArticleAiSummarySessionSnapshotDto | null): boolean {
  return session?.status === 'queued' || session?.status === 'running';
}

type LocalArticleState = {
  loading: boolean;
  missingApiKey: boolean;
  waitingFulltext: boolean;
  session: ArticleAiSummarySessionSnapshotDto | null;
};

type LocalStateByArticleId = Record<string, LocalArticleState>;

function createLocalArticleState(
  initialSession: ArticleAiSummarySessionSnapshotDto | null,
): LocalArticleState {
  return {
    loading: isPendingSession(initialSession),
    missingApiKey: false,
    waitingFulltext: false,
    session: initialSession,
  };
}

export function useStreamingAiSummary(
  input: UseStreamingAiSummaryInput,
): UseStreamingAiSummaryResult {
  const api = useMemo(() => input.api ?? defaultApi, [input.api]);
  const [localStates, setLocalStates] = useState<LocalStateByArticleId>(() => {
    const initialSession = input.initialSession ?? null;
    return input.articleId
      ? {
          [input.articleId]: createLocalArticleState(initialSession),
        }
      : {};
  });

  const articleIdRef = useRef<string | null>(input.articleId);
  const onCompletedRef = useRef(input.onCompleted);
  const initialSessionRef = useRef<ArticleAiSummarySessionSnapshotDto | null>(input.initialSession ?? null);
  const requestTokenRef = useRef(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const streamTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCompletedRef.current = input.onCompleted;
  }, [input.onCompleted]);

  useEffect(() => {
    articleIdRef.current = input.articleId;
    initialSessionRef.current = input.initialSession ?? null;
  }, [input.articleId, input.initialSession]);

  const currentLocalState = useMemo(() => {
    if (!input.articleId) return null;
    return localStates[input.articleId] ?? null;
  }, [input.articleId, localStates]);

  const session = useMemo(() => {
    const baseSession = input.initialSession ?? null;
    const localSession = currentLocalState?.session ?? null;

    if (!localSession) return baseSession;
    if (!baseSession) return localSession;
    return getUpdatedAtMs(baseSession) > getUpdatedAtMs(localSession) ? baseSession : localSession;
  }, [currentLocalState?.session, input.initialSession]);

  const loading = useMemo(() => {
    return Boolean((currentLocalState?.loading ?? false) || isPendingSession(session));
  }, [currentLocalState?.loading, session]);

  const missingApiKey = useMemo(() => {
    return currentLocalState?.missingApiKey ?? false;
  }, [currentLocalState?.missingApiKey]);

  const waitingFulltext = useMemo(() => {
    return currentLocalState?.waitingFulltext ?? false;
  }, [currentLocalState?.waitingFulltext]);

  const clearStreamTimeout = useCallback(() => {
    if (!streamTimeoutRef.current) return;
    clearTimeout(streamTimeoutRef.current);
    streamTimeoutRef.current = null;
  }, []);

  const closeStream = useCallback(() => {
    clearStreamTimeout();
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, [clearStreamTimeout]);

  const isCurrentRequest = useCallback((articleId: string, token: number): boolean => {
    return articleIdRef.current === articleId && requestTokenRef.current === token;
  }, []);

  const armStreamTimeout = useCallback(
    (articleId: string, token: number) => {
      clearStreamTimeout();
      streamTimeoutRef.current = setTimeout(() => {
        if (!isCurrentRequest(articleId, token)) return;

        setLocalStates((current) => {
          const currentArticleState =
            current[articleId] ?? createLocalArticleState(initialSessionRef.current);
          const baseSession = currentArticleState.session ?? initialSessionRef.current;
          if (!baseSession) {
            return {
              ...current,
              [articleId]: {
                ...currentArticleState,
                loading: false,
              },
            };
          }

          const now = new Date().toISOString();
          return {
            ...current,
            [articleId]: {
              ...currentArticleState,
              loading: false,
              session: {
                ...baseSession,
                status: 'failed',
                errorCode: 'ai_timeout',
                errorMessage: '处理超时，请稍后重试',
                finishedAt: baseSession.finishedAt ?? now,
                updatedAt: now,
              },
            },
          };
        });

        closeStream();
      }, SUMMARY_STREAM_TIMEOUT_MS);
    },
    [clearStreamTimeout, closeStream, isCurrentRequest],
  );

  const connectStream = useCallback(
    (articleId: string, token: number) => {
      if (!isCurrentRequest(articleId, token)) return;

      closeStream();
      const stream = api.createArticleAiSummaryEventSource(articleId);
      eventSourceRef.current = stream;
      armStreamTimeout(articleId, token);

      const onSummaryDelta: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        armStreamTimeout(articleId, token);
        const payload = parseEventPayload(event);
        const deltaText = typeof payload.deltaText === 'string' ? payload.deltaText : '';
        if (!deltaText) return;

        setLocalStates((current) => {
          const currentArticleState =
            current[articleId] ?? createLocalArticleState(initialSessionRef.current);
          const baseSession = currentArticleState.session ?? initialSessionRef.current;
          if (!baseSession) return current;

          return {
            ...current,
            [articleId]: {
              ...currentArticleState,
              loading: true,
              session: {
                ...baseSession,
                status: baseSession.status === 'queued' ? 'running' : baseSession.status,
                draftText: `${baseSession.draftText}${deltaText}`,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      };

      const onSummarySnapshot: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        armStreamTimeout(articleId, token);
        const payload = parseEventPayload(event);
        if (typeof payload.draftText !== 'string') return;
        const draftText = payload.draftText;

        setLocalStates((current) => {
          const currentArticleState =
            current[articleId] ?? createLocalArticleState(initialSessionRef.current);
          const baseSession = currentArticleState.session ?? initialSessionRef.current;
          if (!baseSession) return current;

          return {
            ...current,
            [articleId]: {
              ...currentArticleState,
              loading: true,
              session: {
                ...baseSession,
                draftText,
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
      };

      const onSessionCompleted: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);

        setLocalStates((current) => {
          const currentArticleState =
            current[articleId] ?? createLocalArticleState(initialSessionRef.current);
          const baseSession = currentArticleState.session ?? initialSessionRef.current;
          if (!baseSession) return current;

          const finalText =
            typeof payload.finalText === 'string' && payload.finalText.trim()
              ? payload.finalText
              : baseSession.draftText;

          return {
            ...current,
            [articleId]: {
              ...currentArticleState,
              loading: false,
              session: {
                ...baseSession,
                status: 'succeeded',
                draftText: finalText,
                finalText,
                errorCode: null,
                errorMessage: null,
                finishedAt: baseSession.finishedAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
        closeStream();
        void Promise.resolve(onCompletedRef.current?.(articleId)).catch((err) => {
          console.error(err);
        });
      };

      const onSessionFailed: EventListener = (event) => {
        if (!isCurrentRequest(articleId, token)) return;
        const payload = parseEventPayload(event);

        setLocalStates((current) => {
          const currentArticleState =
            current[articleId] ?? createLocalArticleState(initialSessionRef.current);
          const baseSession = currentArticleState.session ?? initialSessionRef.current;
          if (!baseSession) return current;

          return {
            ...current,
            [articleId]: {
              ...currentArticleState,
              loading: false,
              session: {
                ...baseSession,
                status: 'failed',
                draftText:
                  typeof payload.draftText === 'string' ? payload.draftText : baseSession.draftText,
                errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : null,
                errorMessage: typeof payload.errorMessage === 'string' ? payload.errorMessage : null,
                finishedAt: baseSession.finishedAt ?? new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            },
          };
        });
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
    [api, armStreamTimeout, closeStream, isCurrentRequest],
  );

  const loadSnapshot = useCallback(
    async (articleId: string, token: number) => {
      const snapshot = await api.getArticleAiSummarySnapshot(articleId);
      if (!isCurrentRequest(articleId, token)) return null;

      setLocalStates((current) => {
        const currentArticleState =
          current[articleId] ?? createLocalArticleState(initialSessionRef.current);

        return {
          ...current,
          [articleId]: {
            ...currentArticleState,
            session: snapshot.session,
            loading: isPendingSession(snapshot.session),
          },
        };
      });

      if (isPendingSession(snapshot.session)) {
        connectStream(articleId, token);
      } else {
        closeStream();
      }

      return snapshot;
    },
    [api, closeStream, connectStream, isCurrentRequest],
  );

  const lastArticleIdRef = useRef<string | null>(input.articleId);

  useEffect(() => {
    const currentArticleId = input.articleId;
    if (lastArticleIdRef.current === currentArticleId) return;

    lastArticleIdRef.current = currentArticleId;
    requestTokenRef.current += 1;
    closeStream();
  }, [closeStream, input.articleId]);

  useEffect(() => {
    if (!input.articleId) return;
    if (!isPendingSession(session)) return;
    if (eventSourceRef.current) return;

    const token = requestTokenRef.current;
    connectStream(input.articleId, token);
  }, [connectStream, input.articleId, session]);

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

      closeStream();
      setLocalStates((current) => {
        const currentArticleState =
          current[articleId] ?? createLocalArticleState(initialSessionRef.current);
        const baseSession = currentArticleState.session ?? initialSessionRef.current;

        return {
          ...current,
          [articleId]: {
            loading: true,
            missingApiKey: false,
            waitingFulltext: false,
            session: baseSession,
          },
        };
      });

      try {
        const enqueueResult = force
          ? await api.enqueueArticleAiSummary(articleId, { force: true })
          : await api.enqueueArticleAiSummary(articleId);
        if (!isCurrentRequest(articleId, token)) return;

        if (enqueueResult.reason === 'missing_api_key') {
          setLocalStates((current) => ({
            ...current,
            [articleId]: {
              ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
              loading: false,
              missingApiKey: true,
            },
          }));
          return;
        }

        if (enqueueResult.reason === 'fulltext_pending') {
          setLocalStates((current) => ({
            ...current,
            [articleId]: {
              ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
              loading: false,
              waitingFulltext: true,
            },
          }));
          return;
        }

        if (enqueueResult.reason === 'already_summarized') {
          setLocalStates((current) => ({
            ...current,
            [articleId]: {
              ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
              loading: false,
            },
          }));
          closeStream();
          return;
        }

        if (enqueueResult.enqueued || enqueueResult.reason === 'already_enqueued') {
          await loadSnapshot(articleId, token);
          return;
        }

        setLocalStates((current) => ({
          ...current,
          [articleId]: {
            ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
            loading: false,
          },
        }));
      } catch (err) {
        console.error(err);
        if (!isCurrentRequest(articleId, token)) return;
        setLocalStates((current) => ({
          ...current,
          [articleId]: {
            ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
            loading: false,
          },
        }));
      }
    },
    [api, closeStream, input.articleId, isCurrentRequest, loadSnapshot],
  );

  const clearTransientState = useCallback(() => {
    const articleId = input.articleId;
    if (!articleId) return;

    setLocalStates((current) => ({
      ...current,
      [articleId]: {
        ...(current[articleId] ?? createLocalArticleState(initialSessionRef.current)),
        missingApiKey: false,
        waitingFulltext: false,
      },
    }));
  }, [input.articleId]);

  return {
    loading,
    missingApiKey,
    waitingFulltext,
    session,
    requestSummary,
    clearTransientState,
  };
}
