import { batchTextDeltas } from '@/server/integrations/ai/batchTextDeltas';
import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import {
  createConfigFingerprintGuard,
  resolveAiConfigFingerprints,
} from '@/server/integrations/ai/configFingerprints';
import { createThinkingDeltaFilter } from '@/server/integrations/ai/deepThinking';
import {
  isAiRuntimeConfigComplete,
  resolveSharedAiConfig,
} from '@/server/integrations/ai/runtimeConfig';
import { streamSummarizeText, type StreamSummarizeTextInput } from '@/server/integrations/ai/streamSummarizeText';
import { getArticleById, setArticleAiSummary, type ArticleRow } from '@/server/domains/articles/repositories/articlesRepo';
import {
  completeAiSummarySession,
  failAiSummarySession,
  getActiveAiSummarySessionByArticleId,
  getAiSummarySessionById,
  insertAiSummaryEvent,
  updateAiSummarySessionDraft,
  upsertAiSummarySession,
  type AiSummarySessionRow,
} from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import { getFeedFullTextOnOpenEnabled } from '@/server/domains/feeds/repositories/feedsRepo';
import { getAiApiKey, getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import {
  getUsableFulltextHtml,
  isFulltextPending,
} from '@/server/integrations/fulltext/fulltextVerification';
import { mapTaskError } from '@/server/domains/settings/tasks/errorMapping';
import { runArticleTaskWithStatus } from '@/worker/articleTaskStatus';

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
  userId?: string | null;
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
  userId?: string | null;
  articleId: string;
  sessionId: string | null;
  jobId: string | null;
  sourceTextHash: string;
  deps: AiSummaryStreamWorkerDeps;
}): Promise<AiSummarySessionRow> {
  const { pool, articleId, sessionId, jobId, sourceTextHash, deps } = input;

  if (sessionId) {
    const session = await deps.getAiSummarySessionById(
      pool,
      sessionId,
      input.userId ?? undefined,
    );
    if (!session || session.articleId !== articleId) {
      throw new Error('AI summary session not found');
    }

    return deps.upsertAiSummarySession(pool, {
      userId: input.userId ?? session.userId,
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

  const activeSession = await deps.getActiveAiSummarySessionByArticleId(
    pool,
    articleId,
    input.userId ?? undefined,
  );
  if (
    activeSession &&
    activeSession.supersededBySessionId === null &&
    activeSession.sourceTextHash === sourceTextHash &&
    (activeSession.status === 'queued' || activeSession.status === 'running')
  ) {
    return deps.upsertAiSummarySession(pool, {
      userId: input.userId ?? undefined,
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
    userId: input.userId ?? undefined,
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
    userId: input.userId,
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
        const article = await deps.getArticleById(input.pool, input.articleId, input.userId ?? undefined);
        if (!article) return;
        if (!input.sessionId && article.aiSummary?.trim()) return;

        const fullTextOnOpenEnabled = await deps.getFeedFullTextOnOpenEnabled(
          input.pool,
          article.feedId,
          article.userId,
        );
        if (isFulltextPending(article, fullTextOnOpenEnabled)) {
          throw new Error('Fulltext pending');
        }

        const ensureSharedConfigCurrent = createConfigFingerprintGuard({
          initialFingerprint: input.sharedConfigFingerprint ?? null,
          loadCurrentFingerprint: async () => {
            const [uiSettings, currentAiApiKey] = await Promise.all([
              deps.getUiSettings(input.pool, article.userId),
              deps.getAiApiKey(input.pool, article.userId),
            ]);
            return resolveAiConfigFingerprints({
              settings: uiSettings,
              aiApiKey: currentAiApiKey,
              translationApiKey: '',
            }).shared;
          },
        });

        const [aiApiKey, uiSettings] = await Promise.all([
          deps.getAiApiKey(input.pool, article.userId),
          deps.getUiSettings(input.pool, article.userId),
        ]);
        const normalizedSettings = normalizePersistedSettings(uiSettings);
        if (!aiApiKey.trim()) throw new Error('Missing AI API key');
        await ensureSharedConfigCurrent();

        const sourceText = getSummarySource(article);
        const sourceTextHash = sha256(sourceText);
        const session = await ensureSummarySession({
          pool: input.pool,
          userId: article.userId,
          articleId: input.articleId,
          sessionId: input.sessionId ?? null,
          jobId: input.jobId,
          sourceTextHash,
          deps,
        });
        sessionIdForFailure = session.id;

        const sharedAiConfig = resolveSharedAiConfig({
          settings: normalizedSettings,
          aiApiKey,
        });
        if (!isAiRuntimeConfigComplete(sharedAiConfig)) {
          throw new Error('Missing AI configuration');
        }

        const { model, apiBaseUrl, apiKey, deepThinkingEnabled } = sharedAiConfig;
        const thinkingFilter = createThinkingDeltaFilter();
        let lastDraftPersistedAt = Date.now();
        let lastConfigCheckedAt = Date.now();

        draftText = session.draftText ?? '';
        await deps.insertAiSummaryEvent(input.pool, {
          userId: article.userId,
          sessionId: session.id,
          eventType: 'session.started',
          payload: {
            articleId: input.articleId,
            sessionId: session.id,
          },
        });

        // 会话开始时仅保存一次基准快照。重连从它重放增量，累计全文不再随每个片段反复插入。
        await deps.insertAiSummaryEvent(input.pool, {
          userId: article.userId,
          sessionId: session.id,
          eventType: 'summary.snapshot',
          payload: { draftText },
        });

        const source = await deps.streamSummarizeText({
          apiBaseUrl,
          apiKey,
          model,
          text: sourceText,
          // 允许用户在设置中自定义摘要提示词；为空时由 AI 层回退默认模板。
          prompt: normalizedSettings.ai.summaryPrompt,
          deepThinkingEnabled,
        });
        async function* visibleDeltas() {
          for await (const deltaText of source) {
            // 只将最终可见文本加入批次，思考内容既不落库也不发送到前端。
            const visible = thinkingFilter.push(deltaText);
            if (visible) yield visible;
          }
        }

        for await (const deltaText of batchTextDeltas(visibleDeltas())) {
          // 配置校验按时间限频，保留生成前、周期性和完成前的过期配置保护。
          if (Date.now() - lastConfigCheckedAt >= 1000) {
            await ensureSharedConfigCurrent();
            lastConfigCheckedAt = Date.now();
          }
          draftText += deltaText;
          await deps.insertAiSummaryEvent(input.pool, {
            userId: article.userId,
            sessionId: session.id,
            eventType: 'summary.delta',
            payload: { deltaText },
          });
          // 草稿每秒更新一次；完成时和失败时另外保存完整尾部，避免频繁覆盖累计全文。
          if (Date.now() - lastDraftPersistedAt >= 1000) {
            await deps.updateAiSummarySessionDraft(input.pool, {
              userId: article.userId,
              sessionId: session.id,
              draftText,
            });
            lastDraftPersistedAt = Date.now();
          }
        }

        // 恢复中的 session 可能已经持久化了前半段草稿，最终结果必须基于累计草稿而不是仅本次增量。
        const finalText = draftText.trim();
        if (!finalText) {
          throw new Error('Invalid summarize response: missing content');
        }

        await ensureSharedConfigCurrent();
        await deps.updateAiSummarySessionDraft(input.pool, {
          userId: article.userId,
          sessionId: session.id,
          draftText,
        });
        await deps.completeAiSummarySession(input.pool, {
          userId: article.userId,
          sessionId: session.id,
          finalText,
          model,
        });
        await deps.insertAiSummaryEvent(input.pool, {
          userId: article.userId,
          sessionId: session.id,
          eventType: 'session.completed',
          payload: {
            articleId: input.articleId,
            sessionId: session.id,
            finalText,
          },
        });
        await deps.setArticleAiSummary(input.pool, input.articleId, {
          userId: article.userId,
          aiSummary: finalText,
          aiSummaryModel: model,
        });
      } catch (err) {
        if (sessionIdForFailure) {
          const mapped = mapTaskError({ type: 'ai_summary', err });
          let failureDraftText = draftText;
          if (!failureDraftText) {
            try {
              const existingSession = await deps.getAiSummarySessionById(
                input.pool,
                sessionIdForFailure,
                input.userId ?? undefined,
              );
              failureDraftText = existingSession?.draftText ?? '';
            } catch {
              // Keep best-effort fallback draft text.
            }
          }

          try {
            await deps.failAiSummarySession(input.pool, {
              userId: input.userId ?? undefined,
              sessionId: sessionIdForFailure,
              draftText: failureDraftText,
              errorCode: mapped.errorCode,
              errorMessage: mapped.errorMessage,
              rawErrorMessage: mapped.rawErrorMessage,
            });
            await deps.insertAiSummaryEvent(input.pool, {
              userId: input.userId ?? undefined,
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
