import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import {
  createConfigFingerprintGuard,
  resolveAiConfigFingerprints,
} from '../server/ai/configFingerprints';
import {
  isAiRuntimeConfigComplete,
  resolveSharedAiConfig,
} from '../server/ai/runtimeConfig';
import { streamSummarizeText, type StreamSummarizeTextInput } from '../server/ai/streamSummarizeText';
import { getArticleById, setArticleAiSummary, type ArticleRow } from '../server/repositories/articlesRepo';
import {
  completeAiSummarySession,
  failAiSummarySession,
  getActiveAiSummarySessionByArticleId,
  getAiSummarySessionById,
  insertAiSummaryEvent,
  updateAiSummarySessionDraft,
  upsertAiSummarySession,
  type AiSummarySessionRow,
} from '../server/repositories/articleAiSummaryRepo';
import { getFeedFullTextOnOpenEnabled } from '../server/repositories/feedsRepo';
import { getAiApiKey, getUiSettings } from '../server/repositories/settingsRepo';
import {
  getUsableFulltextHtml,
  isFulltextPending,
} from '../server/fulltext/fulltextVerification';
import { mapTaskError } from '../server/tasks/errorMapping';
import { runArticleTaskWithStatus } from './articleTaskStatus';

const MAX_SUMMARY_SOURCE_LENGTH = 16_000;

type RunArticleTaskWithStatusFn = typeof runArticleTaskWithStatus;
type StreamSummarizeTextFn = (
  input: StreamSummarizeTextInput,
) => AsyncIterable<string> | Promise<AsyncIterable<string>>;

interface AiSummaryStreamWorkerDeps {
  getArticleById: typeof getArticleById;
  getAiSummarySessionById: typeof getAiSummarySessionById;
  getActiveAiSummarySessionByArticleId: typeof getActiveAiSummarySessionByArticleId;
  upsertAiSummarySession: typeof upsertAiSummarySession;
  getAiApiKey: typeof getAiApiKey;
  getUiSettings: typeof getUiSettings;
  getFeedFullTextOnOpenEnabled: typeof getFeedFullTextOnOpenEnabled;
  runArticleTaskWithStatus: RunArticleTaskWithStatusFn;
  streamSummarizeText: StreamSummarizeTextFn;
  updateAiSummarySessionDraft: typeof updateAiSummarySessionDraft;
  insertAiSummaryEvent: typeof insertAiSummaryEvent;
  completeAiSummarySession: typeof completeAiSummarySession;
  failAiSummarySession: typeof failAiSummarySession;
  setArticleAiSummary: typeof setArticleAiSummary;
}

export interface RunAiSummaryStreamWorkerInput {
  pool: Pool;
  articleId: string;
  sessionId?: string | null;
  jobId: string | null;
  sharedConfigFingerprint?: string | null;
  deps?: Partial<AiSummaryStreamWorkerDeps>;
}

const defaultDeps: AiSummaryStreamWorkerDeps = {
  getArticleById,
  getAiSummarySessionById,
  getActiveAiSummarySessionByArticleId,
  upsertAiSummarySession,
  getAiApiKey,
  getUiSettings,
  getFeedFullTextOnOpenEnabled,
  runArticleTaskWithStatus,
  streamSummarizeText,
  updateAiSummarySessionDraft,
  insertAiSummaryEvent,
  completeAiSummarySession,
  failAiSummarySession,
  setArticleAiSummary,
};

function resolveDeps(overrides: Partial<AiSummaryStreamWorkerDeps> | undefined): AiSummaryStreamWorkerDeps {
  return {
    ...defaultDeps,
    ...(overrides ?? {}),
  };
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function pickSummarySourceText(input: {
  contentFullHtml: string | null;
  contentHtml: string | null;
  summary: string | null;
}): string | null {
  const source = input.contentFullHtml ?? input.contentHtml ?? input.summary;
  if (!source) return null;

  const plain = htmlToPlainText(source);
  if (!plain) return null;

  if (plain.length <= MAX_SUMMARY_SOURCE_LENGTH) return plain;
  return plain.slice(0, MAX_SUMMARY_SOURCE_LENGTH);
}

async function ensureSummarySession(input: {
  pool: Pool;
  articleId: string;
  sessionId: string | null;
  jobId: string | null;
  sourceTextHash: string;
  deps: AiSummaryStreamWorkerDeps;
}): Promise<AiSummarySessionRow> {
  const { pool, articleId, sessionId, jobId, sourceTextHash, deps } = input;

  if (sessionId) {
    const session = await deps.getAiSummarySessionById(pool, sessionId);
    if (!session || session.articleId !== articleId) {
      throw new Error('AI summary session not found');
    }

    return deps.upsertAiSummarySession(pool, {
      sessionId: session.id,
      articleId,
      sourceTextHash,
      status: 'running',
      draftText: session.draftText ?? '',
      finalText: null,
      model: session.model,
      jobId: jobId ?? session.jobId,
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
      supersededBySessionId: session.supersededBySessionId,
    });
  }

  const activeSession = await deps.getActiveAiSummarySessionByArticleId(pool, articleId);
  if (
    activeSession &&
    activeSession.supersededBySessionId === null &&
    activeSession.sourceTextHash === sourceTextHash &&
    (activeSession.status === 'queued' || activeSession.status === 'running')
  ) {
    return deps.upsertAiSummarySession(pool, {
      sessionId: activeSession.id,
      articleId,
      sourceTextHash,
      status: 'running',
      draftText: activeSession.draftText ?? '',
      finalText: null,
      model: activeSession.model,
      jobId: jobId ?? activeSession.jobId,
      errorCode: null,
      errorMessage: null,
      rawErrorMessage: null,
      supersededBySessionId: null,
    });
  }

  return deps.upsertAiSummarySession(pool, {
    articleId,
    sourceTextHash,
    status: 'running',
    draftText: '',
    finalText: null,
    model: null,
    jobId,
    errorCode: null,
    errorMessage: null,
    rawErrorMessage: null,
    supersededBySessionId: null,
  });
}

function getSummarySource(article: ArticleRow): string {
  const sourceText = pickSummarySourceText({
    contentFullHtml: getUsableFulltextHtml(article),
    contentHtml: article.contentHtml,
    summary: article.summary,
  });
  if (!sourceText) {
    throw new Error('Missing article content');
  }
  return sourceText;
}

export async function runAiSummaryStreamWorker(
  input: RunAiSummaryStreamWorkerInput,
): Promise<void> {
  const deps = resolveDeps(input.deps);

  await deps.runArticleTaskWithStatus({
    pool: input.pool,
    articleId: input.articleId,
    type: 'ai_summary',
    jobId: input.jobId,
    userOperation: {
      actionKey: 'article.aiSummary.generate',
      source: 'worker/aiSummaryStreamWorker',
      context: {
        articleId: input.articleId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      },
    },
    fn: async () => {
      let sessionIdForFailure: string | null = input.sessionId ?? null;
      let draftText = '';

      try {
        const article = await deps.getArticleById(input.pool, input.articleId);
        if (!article) return;
        if (!input.sessionId && article.aiSummary?.trim()) return;

        const fullTextOnOpenEnabled = await deps.getFeedFullTextOnOpenEnabled(
          input.pool,
          article.feedId,
        );
        if (isFulltextPending(article, fullTextOnOpenEnabled)) {
          throw new Error('Fulltext pending');
        }

        const ensureSharedConfigCurrent = createConfigFingerprintGuard({
          initialFingerprint: input.sharedConfigFingerprint ?? null,
          loadCurrentFingerprint: async () => {
            const [uiSettings, currentAiApiKey] = await Promise.all([
              deps.getUiSettings(input.pool),
              deps.getAiApiKey(input.pool),
            ]);
            return resolveAiConfigFingerprints({
              settings: uiSettings,
              aiApiKey: currentAiApiKey,
              translationApiKey: '',
            }).shared;
          },
        });

        const [aiApiKey, uiSettings] = await Promise.all([
          deps.getAiApiKey(input.pool),
          deps.getUiSettings(input.pool),
        ]);
        if (!aiApiKey.trim()) throw new Error('Missing AI API key');
        await ensureSharedConfigCurrent();

        const sourceText = getSummarySource(article);
        const sourceTextHash = sha256(sourceText);
        const session = await ensureSummarySession({
          pool: input.pool,
          articleId: input.articleId,
          sessionId: input.sessionId ?? null,
          jobId: input.jobId,
          sourceTextHash,
          deps,
        });
        sessionIdForFailure = session.id;

        const sharedAiConfig = resolveSharedAiConfig({
          settings: normalizePersistedSettings(uiSettings),
          aiApiKey,
        });
        if (!isAiRuntimeConfigComplete(sharedAiConfig)) {
          throw new Error('Missing AI configuration');
        }

        const { model, apiBaseUrl, apiKey } = sharedAiConfig;

        draftText = session.draftText ?? '';
        await deps.insertAiSummaryEvent(input.pool, {
          sessionId: session.id,
          eventType: 'session.started',
          payload: {
            articleId: input.articleId,
            sessionId: session.id,
          },
        });

        for await (const deltaText of await deps.streamSummarizeText({
          apiBaseUrl,
          apiKey,
          model,
          text: sourceText,
        })) {
          await ensureSharedConfigCurrent();
          draftText += deltaText;

          await deps.updateAiSummarySessionDraft(input.pool, {
            sessionId: session.id,
            draftText,
          });
          await deps.insertAiSummaryEvent(input.pool, {
            sessionId: session.id,
            eventType: 'summary.delta',
            payload: { deltaText },
          });
          await deps.insertAiSummaryEvent(input.pool, {
            sessionId: session.id,
            eventType: 'summary.snapshot',
            payload: { draftText },
          });
        }

        const finalText = draftText.trim();
        if (!finalText) {
          throw new Error('Invalid summarize response: missing content');
        }

        await ensureSharedConfigCurrent();
        await deps.completeAiSummarySession(input.pool, {
          sessionId: session.id,
          finalText,
          model,
        });
        await deps.insertAiSummaryEvent(input.pool, {
          sessionId: session.id,
          eventType: 'session.completed',
          payload: {
            articleId: input.articleId,
            sessionId: session.id,
            finalText,
          },
        });
        await deps.setArticleAiSummary(input.pool, input.articleId, {
          aiSummary: finalText,
          aiSummaryModel: model,
        });
      } catch (err) {
        if (sessionIdForFailure) {
          const mapped = mapTaskError({ type: 'ai_summary', err });
          let failureDraftText = draftText;
          if (!failureDraftText) {
            try {
              const existingSession = await deps.getAiSummarySessionById(input.pool, sessionIdForFailure);
              failureDraftText = existingSession?.draftText ?? '';
            } catch {
              // Keep best-effort fallback draft text.
            }
          }

          try {
            await deps.failAiSummarySession(input.pool, {
              sessionId: sessionIdForFailure,
              draftText: failureDraftText,
              errorCode: mapped.errorCode,
              errorMessage: mapped.errorMessage,
              rawErrorMessage: mapped.rawErrorMessage,
            });
            await deps.insertAiSummaryEvent(input.pool, {
              sessionId: sessionIdForFailure,
              eventType: 'session.failed',
              payload: {
                articleId: input.articleId,
                sessionId: sessionIdForFailure,
                draftText: failureDraftText,
                errorCode: mapped.errorCode,
                errorMessage: mapped.errorMessage,
                rawErrorMessage: mapped.rawErrorMessage,
              },
            });
          } catch {
            // Keep the original worker failure as the thrown error.
          }
        }
        throw err;
      }
    },
  });
}
