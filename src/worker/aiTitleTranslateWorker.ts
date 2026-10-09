import type { Pool } from 'pg';
import {
  getArticleById,
  recordArticleTitleTranslationFailure,
  setArticleTitleTranslation,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
} from '@/server/domains/settings/repositories/settingsRepo';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import {
  createConfigFingerprintGuard,
  resolveAiConfigFingerprints,
} from '@/server/integrations/ai/configFingerprints';
import { translateTitle } from '@/server/integrations/ai/translateTitle';
import {
  isTranslationConfigComplete,
  resolveTranslationConfig,
} from '@/server/integrations/ai/translationConfig';

export async function runAiTitleTranslateWorker(input: {
  pool: Pool;
  articleId: string;
  userId?: string;
}): Promise<void> {
  const { pool, articleId, userId } = input;
  const article = await getArticleById(pool, articleId, userId);
  if (!article || article.titleZh?.trim()) return;

  const titleSource = (article.titleOriginal || article.title).trim();
  if (!titleSource) return;

  // 每次执行重新读取用户配置，并在落库前校验指纹，避免保存过期配置的结果。
  const ensureTranslationConfigCurrent = createConfigFingerprintGuard({
    loadCurrentFingerprint: async () => {
      const [uiSettings, aiApiKey, translationApiKey] = await Promise.all([
        getUiSettings(pool, article.userId),
        getAiApiKey(pool, article.userId),
        getTranslationApiKey(pool, article.userId),
      ]);
      return resolveAiConfigFingerprints({
        settings: uiSettings,
        aiApiKey,
        translationApiKey,
      }).translation;
    },
  });

  const uiSettings = await getUiSettings(pool, article.userId);
  const normalizedSettings = normalizePersistedSettings(uiSettings);
  const aiApiKey = await getAiApiKey(pool, article.userId);
  const translationApiKey = await getTranslationApiKey(pool, article.userId);
  await ensureTranslationConfigCurrent();
  const resolved = resolveTranslationConfig({
    settings: normalizedSettings,
    aiApiKey,
    translationApiKey,
  });
  if (!resolved.apiKey.trim() || !isTranslationConfigComplete(resolved)) return;
  const { model, apiBaseUrl, apiKey, deepThinkingEnabled } = resolved;

  try {
    const translatedTitle = await translateTitle({
      apiBaseUrl,
      apiKey,
      model,
      title: titleSource,
      // 标题翻译与正文翻译共用同一条用户可配置的翻译提示词。
      prompt: normalizedSettings.ai.translationPrompt,
      deepThinkingEnabled,
    });
    await ensureTranslationConfigCurrent();
    if (!translatedTitle.trim()) {
      throw new Error('Invalid title translation: empty result');
    }

    await setArticleTitleTranslation(pool, articleId, {
      userId: article.userId,
      titleZh: translatedTitle.trim(),
      titleTranslationModel: model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown title translation error';
    await recordArticleTitleTranslationFailure(pool, articleId, {
      userId: article.userId,
      error: message,
    });
    // 文章的累计失败次数只用于诊断；每个任务的重试预算由 pg-boss 决定。
    // 最后一次失败也必须抛出，让队列标记 failed，不能将失败误报为完成。
    throw err instanceof Error ? err : new Error(message);
  }
}
