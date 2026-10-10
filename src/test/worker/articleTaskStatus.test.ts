import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertTaskRunningMock = vi.fn();
const upsertTaskSucceededMock = vi.fn();
const upsertTaskFailedMock = vi.fn();
const mapTaskErrorMock = vi.fn();
const writeUserOperationStartedLogMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('@/server/domains/articles/repositories/articleTasksRepo', () => ({
  upsertTaskRunning: (...args: unknown[]) => upsertTaskRunningMock(...args),
  upsertTaskSucceeded: (...args: unknown[]) => upsertTaskSucceededMock(...args),
  upsertTaskFailed: (...args: unknown[]) => upsertTaskFailedMock(...args),
}));

vi.mock('@/server/domains/settings/tasks/errorMapping', () => ({
  mapTaskError: (...args: unknown[]) => mapTaskErrorMock(...args),
}));

vi.mock('@/server/infra/logging/userOperationLogger', () => ({
  writeUserOperationStartedLog: (...args: unknown[]) => writeUserOperationStartedLogMock(...args),
  writeUserOperationSucceededLog: (...args: unknown[]) => writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) => writeUserOperationFailedLogMock(...args),
}));

describe('articleTaskStatus', () => {
  beforeEach(() => {
    upsertTaskRunningMock.mockReset();
    upsertTaskSucceededMock.mockReset();
    upsertTaskFailedMock.mockReset();
    mapTaskErrorMock.mockReset();
    writeUserOperationStartedLogMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
  });

  it('does not run or log a worker after a task ownership claim is rejected', async () => {
    upsertTaskRunningMock.mockResolvedValue(false);
    const fn = vi.fn();
    const mod = await import('@/worker/articleTaskStatus');
    await mod.runArticleTaskWithStatus({
      pool: {} as never, userId: '1', articleId: '20', type: 'ai_summary', jobId: 'old-job',
      userOperation: { actionKey: 'article.aiSummary.generate', source: 'test' }, fn,
    });
    expect(fn).not.toHaveBeenCalled();
    expect(writeUserOperationStartedLogMock).not.toHaveBeenCalled();
    expect(upsertTaskSucceededMock).not.toHaveBeenCalled();
  });

  it('writes started and succeeded lifecycle logs when configured', async () => {
    const mod = await import('../../worker/articleTaskStatus');
    const result = await mod.runArticleTaskWithStatus({
      pool: {} as never,
      articleId: 'article-1',
      type: 'ai_translate',
      jobId: 'job-1',
      userOperation: {
        actionKey: 'article.aiTranslate.retrySegment',
        source: 'worker/index',
        context: { articleId: 'article-1', jobId: 'job-1' },
      },
      fn: async () => 'ok',
    });

    expect(result).toBe('ok');
    expect(writeUserOperationStartedLogMock).toHaveBeenCalledOnce();
    expect(writeUserOperationStartedLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: 'article.aiTranslate.retrySegment' }),
    );
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledOnce();
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ actionKey: 'article.aiTranslate.retrySegment' }),
    );
  });

  it('uses error level for failed terminal worker logs and never emits warning', async () => {
    mapTaskErrorMock.mockReturnValue({
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });

    const mod = await import('../../worker/articleTaskStatus');
    await expect(
      mod.runArticleTaskWithStatus({
        pool: {} as never,
        articleId: 'article-1',
        type: 'ai_translate',
        jobId: 'job-1',
        userOperation: {
          actionKey: 'article.aiTranslate.retrySegment',
          source: 'worker/articleTaskStatus',
          context: { articleId: 'article-1', jobId: 'job-1' },
        },
        fn: async () => {
          throw new Error('429 rate limit');
        },
      }),
    ).rejects.toThrow('429 rate limit');

    expect(upsertTaskFailedMock).toHaveBeenCalled();
    expect(writeUserOperationFailedLogMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionKey: 'article.aiTranslate.retrySegment',
        details: '429 rate limit',
      }),
    );
  });
});
