import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
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
import { mapTaskError } from '../server/tasks/errorMapping';
import { runArticleTaskWithStatus } from './articleTaskStatus';

const DEFAULT_SUMMARY_MODEL = 'gpt-4o-mini';
const DEFAULT_SUMMARY_API_BASE_URL = 'https://api.openai.com/v1';
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
    supersededBySessionId: null,
  });
}

function getSummarySource(article: ArticleRow): string {
  const sourceText = pickSummarySourceText({
    contentFullHtml: article.contentFullHtml,
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
    fn: async () => {
      const article = await deps.getArticleById(input.pool, input.articleId);
      if (!article) return;
      if (!input.sessionId && article.aiSummary?.trim()) return;

      const fullTextOnOpenEnabled = await deps.getFeedFullTextOnOpenEnabled(
        input.pool,
        article.feedId,
      );
      if (
        fullTextOnOpenEnabled === true &&
        !article.contentFullHtml &&
        !article.contentFullError
      ) {
        throw new Error('Fulltext pending');
      }

      const aiApiKey = await deps.getAiApiKey(input.pool);
      if (!aiApiKey.trim()) throw new Error('Missing AI API key');

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

      const uiSettings = await deps.getUiSettings(input.pool);
      const normalizedSettings = normalizePersistedSettings(uiSettings);
      const model = normalizedSettings.ai.model.trim() || DEFAULT_SUMMARY_MODEL;
      const apiBaseUrl = normalizedSettings.ai.apiBaseUrl.trim() || DEFAULT_SUMMARY_API_BASE_URL;

      let draftText = session.draftText ?? '';
      await deps.insertAiSummaryEvent(input.pool, {
        sessionId: session.id,
        eventType: 'session.started',
        payload: {
          articleId: input.articleId,
          sessionId: session.id,
        },
      });

      try {
        for await (const deltaText of await deps.streamSummarizeText({
          apiBaseUrl,
          apiKey: aiApiKey,
          model,
          text: sourceText,
        })) {
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
        const mapped = mapTaskError({ type: 'ai_summary', err });

        await deps.failAiSummarySession(input.pool, {
          sessionId: session.id,
          draftText,
          errorCode: mapped.errorCode,
          errorMessage: mapped.errorMessage,
        });
        await deps.insertAiSummaryEvent(input.pool, {
          sessionId: session.id,
          eventType: 'session.failed',
          payload: {
            articleId: input.articleId,
            sessionId: session.id,
            draftText,
            errorCode: mapped.errorCode,
            errorMessage: mapped.errorMessage,
          },
        });

        throw err;
      }
    },
  });
}
