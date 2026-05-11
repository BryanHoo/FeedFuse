import type { Pool } from 'pg';
import { normalizePersistedSettings } from '../features/settings/settingsSchema';
import { composePrivateFmScript, type PrivateFmScriptArticle } from '../server/ai/privateFmScript';
import {
  getPrivateFmEpisodeById,
  markPrivateFmEpisodeFailed,
  markPrivateFmEpisodeRunning,
  markPrivateFmEpisodeScriptReady,
  markPrivateFmEpisodeSucceeded,
  type PrivateFmEpisodeRow,
} from '../server/repositories/privateFmRepo';
import { getAiApiKey, getPrivateFmApiKey, getUiSettings } from '../server/repositories/settingsRepo';
import { synthesizeStepFunSpeech } from '../server/tts/stepfunTts';
import { mergePrivateFmAudioParts, writePrivateFmAudioPart } from '../server/private-fm/mediaStorage';

const DEFAULT_AI_MODEL = 'gpt-4o-mini';
const DEFAULT_AI_API_BASE_URL = 'https://api.openai.com/v1';
const MAX_TTS_INPUT_CHARS = 1000;

type PrivateFmGenerateDeps = {
  getPrivateFmEpisodeById: typeof getPrivateFmEpisodeById;
  getPrivateFmApiKey: typeof getPrivateFmApiKey;
  getAiApiKey: typeof getAiApiKey;
  getUiSettings: typeof getUiSettings;
  listSourceArticlesByRunId: (pool: Pool, runId: string) => Promise<PrivateFmScriptArticle[]>;
  markPrivateFmEpisodeRunning: typeof markPrivateFmEpisodeRunning;
  markPrivateFmEpisodeScriptReady: typeof markPrivateFmEpisodeScriptReady;
  markPrivateFmEpisodeSucceeded: typeof markPrivateFmEpisodeSucceeded;
  markPrivateFmEpisodeFailed: typeof markPrivateFmEpisodeFailed;
  composePrivateFmScript: typeof composePrivateFmScript;
  synthesizeStepFunSpeech: typeof synthesizeStepFunSpeech;
  writePrivateFmAudioPart: typeof writePrivateFmAudioPart;
  mergePrivateFmAudioParts: typeof mergePrivateFmAudioParts;
};

const defaultDeps: PrivateFmGenerateDeps = {
  getPrivateFmEpisodeById,
  getPrivateFmApiKey,
  getAiApiKey,
  getUiSettings,
  markPrivateFmEpisodeRunning,
  markPrivateFmEpisodeScriptReady,
  markPrivateFmEpisodeSucceeded,
  markPrivateFmEpisodeFailed,
  composePrivateFmScript,
  synthesizeStepFunSpeech,
  writePrivateFmAudioPart,
  mergePrivateFmAudioParts,
  listSourceArticlesByRunId: async (pool, runId) => {
    const { rows } = await pool.query<PrivateFmScriptArticle>(
      `
        select
          a.id,
          f.title as "feedTitle",
          a.title,
          a.summary,
          a.content_full_html as "contentFullHtml",
          a.fetched_at as "fetchedAt"
        from ai_digest_run_sources s
        join articles a on a.id = s.source_article_id
        join feeds f on f.id = a.feed_id
        where s.run_id = $1
        order by s.position asc
      `,
      [runId],
    );
    return rows;
  },
};

function resolveDeps(overrides?: Partial<PrivateFmGenerateDeps>): PrivateFmGenerateDeps {
  return { ...defaultDeps, ...(overrides ?? {}) };
}

function splitScriptForTts(script: string): string[] {
  const normalized = script.replace(/\r\n/g, '\n').trim();
  const paragraphs = normalized.split(/\n{2,}|\n(?=\S)/).map((item) => item.trim()).filter(Boolean);
  const parts: string[] = [];
  let current = '';

  for (const paragraph of paragraphs.length ? paragraphs : [normalized]) {
    if (paragraph.length > MAX_TTS_INPUT_CHARS) {
      if (current) {
        parts.push(current);
        current = '';
      }
      for (let index = 0; index < paragraph.length; index += MAX_TTS_INPUT_CHARS) {
        parts.push(paragraph.slice(index, index + MAX_TTS_INPUT_CHARS));
      }
      continue;
    }

    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (next.length > MAX_TTS_INPUT_CHARS) {
      if (current) parts.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) parts.push(current);
  return parts;
}

function mapPrivateFmError(err: unknown): { errorCode: string; errorMessage: string } {
  const text = err instanceof Error ? err.message : String(err);
  if (/api key|401|unauthorized/i.test(text)) {
    return { errorCode: 'private_fm_invalid_api_key', errorMessage: 'StepFun TTS 配置无效，请检查私人 FM 设置' };
  }
  if (/429|rate limit/i.test(text)) {
    return { errorCode: 'private_fm_rate_limited', errorMessage: 'StepFun TTS 请求太频繁，请稍后重试' };
  }
  const stepFunHttpError = text.match(/StepFun TTS failed:\s*HTTP\s*(\d+)\s*(.*)/i);
  if (stepFunHttpError) {
    const status = stepFunHttpError[1];
    const details = stepFunHttpError[2]?.trim();
    const suffix = details ? ` ${details.slice(0, 160)}` : '';
    return {
      errorCode: 'private_fm_tts_http_error',
      errorMessage: `StepFun TTS 失败：HTTP ${status}${suffix}`,
    };
  }
  if (/abort|timeout|timed out/i.test(text)) {
    return { errorCode: 'private_fm_tts_timeout', errorMessage: 'StepFun TTS 请求超时，请稍后重试' };
  }
  if (/media path|audio merge|ffmpeg|ENOENT|EACCES|EPERM/i.test(text)) {
    return { errorCode: 'private_fm_storage_error', errorMessage: '私人 FM 音频存储失败，请检查媒体目录权限' };
  }
  return { errorCode: 'private_fm_failed', errorMessage: '私人 FM 生成失败，请稍后重试' };
}

export async function runPrivateFmGenerate(input: {
  pool: Pool;
  episodeId: string;
  jobId?: string | null;
  deps?: Partial<PrivateFmGenerateDeps>;
}): Promise<void> {
  const deps = resolveDeps(input.deps);
  const episode = await deps.getPrivateFmEpisodeById(input.pool, input.episodeId) as PrivateFmEpisodeRow | null;
  if (!episode) throw new Error('Private FM episode not found');
  if (input.jobId && episode.jobId && episode.jobId !== input.jobId) return;
  if (episode.status === 'succeeded' && episode.audioPaths.length > 0) {
    if (episode.mergedAudioPath) return;
    const responseFormat = episode.responseFormat ?? 'mp3';
    const mergedAudioPath = await deps.mergePrivateFmAudioParts({
      episodeId: episode.id,
      audioPaths: episode.audioPaths,
      extension: responseFormat,
    });
    await deps.markPrivateFmEpisodeSucceeded(input.pool, episode.id, {
      scriptText: episode.scriptText ?? '',
      audioPaths: episode.audioPaths,
      mergedAudioPath,
      ttsModel: episode.ttsModel ?? '',
      voice: episode.voice ?? '',
      responseFormat,
    });
    return;
  }

  await deps.markPrivateFmEpisodeRunning(input.pool, episode.id, { jobId: input.jobId ?? null });

  const privateFmApiKey = await deps.getPrivateFmApiKey(input.pool);
  if (!privateFmApiKey.trim()) {
    await deps.markPrivateFmEpisodeFailed(input.pool, episode.id, {
      errorCode: 'missing_private_fm_api_key',
      errorMessage: '请先在设置中配置 StepFun TTS API 密钥',
    });
    return;
  }

  try {
    const rawSettings = await deps.getUiSettings(input.pool);
    const settings = normalizePersistedSettings(rawSettings);
    let script = episode.scriptText?.trim() ?? '';
    if (!script) {
      const aiApiKey = await deps.getAiApiKey(input.pool);
      if (!aiApiKey.trim()) throw new Error('Missing AI API key');

      const sourceArticles = await deps.listSourceArticlesByRunId(input.pool, episode.runId);
      if (sourceArticles.length === 0) {
        throw new Error('Private FM source articles not found');
      }

      script = await deps.composePrivateFmScript({
        apiBaseUrl: settings.ai.apiBaseUrl.trim() || DEFAULT_AI_API_BASE_URL,
        apiKey: aiApiKey,
        model: settings.ai.model.trim() || DEFAULT_AI_MODEL,
        articles: sourceArticles,
      });
    }
    await deps.markPrivateFmEpisodeScriptReady(input.pool, episode.id, { scriptText: script });

    const tts = settings.ai.privateFm;
    const parts = splitScriptForTts(script);
    const audioPaths: string[] = [];
    for (let index = 0; index < parts.length; index += 1) {
      const bytes = await deps.synthesizeStepFunSpeech({
        apiBaseUrl: tts.apiBaseUrl,
        apiKey: privateFmApiKey,
        model: tts.model,
        voice: tts.voice,
        text: parts[index],
        responseFormat: tts.responseFormat,
        speed: tts.speed,
        volume: tts.volume,
      });
      audioPaths.push(await deps.writePrivateFmAudioPart({
        episodeId: episode.id,
        partIndex: index,
        extension: tts.responseFormat,
        bytes,
      }));
    }
    const mergedAudioPath = await deps.mergePrivateFmAudioParts({
      episodeId: episode.id,
      audioPaths,
      extension: tts.responseFormat,
    });

    await deps.markPrivateFmEpisodeSucceeded(input.pool, episode.id, {
      scriptText: script,
      audioPaths,
      mergedAudioPath,
      ttsModel: tts.model,
      voice: tts.voice,
      responseFormat: tts.responseFormat,
    });
  } catch (err) {
    await deps.markPrivateFmEpisodeFailed(input.pool, episode.id, mapPrivateFmError(err));
  }
}
