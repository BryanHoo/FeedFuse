import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getQueueCreateOptions, getQueueSendOptions } from '@/server/infra/queue/contracts';
import { AiConfigChangedError } from '@/server/integrations/ai/configFingerprints';
import { runAiTitleTranslateWorker } from '@/worker/aiTitleTranslateWorker';

const mocks = vi.hoisted(() => ({
  getArticleById: vi.fn(),
  recordArticleTitleTranslationFailure: vi.fn(),
  setArticleTitleTranslation: vi.fn(),
  getUiSettings: vi.fn(),
  getAiApiKey: vi.fn(),
  getTranslationApiKey: vi.fn(),
  translateTitle: vi.fn(),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  getArticleById: mocks.getArticleById,
  recordArticleTitleTranslationFailure: mocks.recordArticleTitleTranslationFailure,
  setArticleTitleTranslation: mocks.setArticleTitleTranslation,
}));
vi.mock('@/server/domains/settings/repositories/settingsRepo', () => ({
  getUiSettings: mocks.getUiSettings,
  getAiApiKey: mocks.getAiApiKey,
  getTranslationApiKey: mocks.getTranslationApiKey,
}));
vi.mock('@/server/integrations/ai/translateTitle', () => ({
  translateTitle: mocks.translateTitle,
}));

describe('aiTitleTranslateWorker', () => {
  const pool = { query: vi.fn() } as unknown as Pool;
  const input = { pool, articleId: 'a1', userId: 'u1' };
  const settings = {
    ai: {
      model: 'translation-model',
      apiBaseUrl: 'https://example.com/v1',
      translationPrompt: '请翻译标题',
      deepThinkingEnabled: true,
      translation: { useSharedAi: true },
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getArticleById.mockResolvedValue({
      id: 'a1', userId: 'u1', title: 'Fallback title', titleOriginal: 'Original title', titleZh: null,
    });
    mocks.getUiSettings.mockResolvedValue(settings);
    mocks.getAiApiKey.mockResolvedValue('test-key');
    mocks.getTranslationApiKey.mockResolvedValue('');
    mocks.translateTitle.mockResolvedValue(' 翻译后的标题 ');
    mocks.recordArticleTitleTranslationFailure.mockResolvedValue(1);
    mocks.setArticleTitleTranslation.mockResolvedValue(undefined);
  });

  // 使用实际契约驱动执行次数，模拟 pg-boss 的“首次执行 + retryLimit 次重试”。
  async function executeWithQueueRetries(): Promise<unknown[]> {
    const options = {
      ...getQueueCreateOptions('ai.translate_title_zh'),
      ...getQueueSendOptions('ai.translate_title_zh', input),
    };
    const errors: unknown[] = [];
    for (let retryCount = 0; retryCount <= Number(options.retryLimit ?? 2); retryCount += 1) {
      try {
        await runAiTitleTranslateWorker(input);
        break;
      } catch (err) {
        errors.push(err);
      }
    }
    return errors;
  }

  it('recovers after two transient network failures and persists the translated title', async () => {
    const networkError = new Error('ECONNRESET');
    const timeoutError = new Error('Connection timed out');
    mocks.translateTitle
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(timeoutError);
    mocks.recordArticleTitleTranslationFailure.mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await executeWithQueueRetries()).toEqual([networkError, timeoutError]);
    expect(mocks.translateTitle).toHaveBeenCalledTimes(3);
    expect(mocks.recordArticleTitleTranslationFailure).toHaveBeenCalledTimes(2);
    expect(mocks.getArticleById).toHaveBeenCalledWith(pool, 'a1', 'u1');
    expect(mocks.translateTitle).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Original title', prompt: '请翻译标题', deepThinkingEnabled: true,
    }));
    expect(mocks.setArticleTitleTranslation).toHaveBeenCalledExactlyOnceWith(pool, 'a1', {
      userId: 'u1', titleZh: '翻译后的标题', titleTranslationModel: 'translation-model',
    });
  });

  it('propagates the final failure and stops after three queue executions', async () => {
    const error = new Error('fetch failed');
    mocks.translateTitle.mockRejectedValue(error);
    mocks.recordArticleTitleTranslationFailure
      .mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(3);

    expect(await executeWithQueueRetries()).toEqual([error, error, error]);
    expect(mocks.translateTitle).toHaveBeenCalledTimes(3);
    expect(mocks.recordArticleTitleTranslationFailure).toHaveBeenCalledTimes(3);
    expect(mocks.setArticleTitleTranslation).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 6])('propagates network failure when cumulative failure count is %i', async (attempts) => {
    const error = new Error('ECONNRESET');
    mocks.translateTitle.mockRejectedValue(error);
    mocks.recordArticleTitleTranslationFailure.mockResolvedValue(attempts);

    await expect(runAiTitleTranslateWorker(input)).rejects.toBe(error);
    expect(mocks.translateTitle).toHaveBeenCalledTimes(1);
    expect(mocks.recordArticleTitleTranslationFailure).toHaveBeenCalledExactlyOnceWith(pool, 'a1', {
      userId: 'u1', error: 'ECONNRESET',
    });
    expect(mocks.setArticleTitleTranslation).not.toHaveBeenCalled();
  });

  it('rejects empty translations and records the error', async () => {
    mocks.translateTitle.mockResolvedValue('  ');

    await expect(runAiTitleTranslateWorker(input)).rejects.toThrow('Invalid title translation: empty result');
    expect(mocks.recordArticleTitleTranslationFailure).toHaveBeenCalledWith(pool, 'a1', {
      userId: 'u1', error: 'Invalid title translation: empty result',
    });
    expect(mocks.setArticleTitleTranslation).not.toHaveBeenCalled();
  });

  it('rejects results when translation settings change during the request', async () => {
    mocks.translateTitle.mockImplementation(async () => {
      mocks.getAiApiKey.mockResolvedValue('changed-key');
      return '翻译后的标题';
    });

    await expect(runAiTitleTranslateWorker(input)).rejects.toBeInstanceOf(AiConfigChangedError);
    expect(mocks.setArticleTitleTranslation).not.toHaveBeenCalled();
  });

  it('normalizes non-Error failures so the queue can observe them', async () => {
    mocks.translateTitle.mockRejectedValue(null);
    mocks.recordArticleTitleTranslationFailure.mockResolvedValue(3);

    await expect(runAiTitleTranslateWorker(input)).rejects.toThrow('Unknown title translation error');
  });

  it('skips a title already translated by another execution', async () => {
    mocks.getArticleById.mockResolvedValue({ id: 'a1', userId: 'u1', titleZh: '已有标题' });

    await runAiTitleTranslateWorker(input);
    expect(mocks.translateTitle).not.toHaveBeenCalled();
    expect(mocks.setArticleTitleTranslation).not.toHaveBeenCalled();
  });

  it('skips an article outside the requested user scope', async () => {
    mocks.getArticleById.mockResolvedValue(null);

    await runAiTitleTranslateWorker(input);
    expect(mocks.getArticleById).toHaveBeenCalledWith(pool, 'a1', 'u1');
    expect(mocks.translateTitle).not.toHaveBeenCalled();
  });

  it('skips incomplete translation configuration', async () => {
    mocks.getAiApiKey.mockResolvedValue('');

    await runAiTitleTranslateWorker(input);
    expect(mocks.translateTitle).not.toHaveBeenCalled();
    expect(mocks.recordArticleTitleTranslationFailure).not.toHaveBeenCalled();
  });
});
