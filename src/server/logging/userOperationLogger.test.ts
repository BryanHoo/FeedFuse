import { beforeEach, describe, expect, it, vi } from 'vitest';

const writeSystemLogMock = vi.fn();

vi.mock('./systemLogger', () => ({
  writeSystemLog: (...args: unknown[]) => writeSystemLogMock(...args),
}));

describe('userOperationLogger', () => {
  beforeEach(() => {
    writeSystemLogMock.mockReset();
  });

  it('writes deferred started logs with shared action metadata', async () => {
    const mod = await import('./userOperationLogger');

    await mod.writeUserOperationStartedLog({} as never, {
      actionKey: 'feed.refresh',
      source: 'app/api/feeds/[id]/refresh',
      context: { runId: 'run-1', feedId: 'feed-1' },
    });

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        level: 'info',
        category: 'feed',
        message: '已开始刷新订阅源',
        context: expect.objectContaining({
          actionKey: 'feed.refresh',
          operationMode: 'deferred',
          operationStage: 'started',
          runId: 'run-1',
          feedId: 'feed-1',
        }),
      }),
    );
  });

  it('writes failed terminal logs with short reason and raw details', async () => {
    const mod = await import('./userOperationLogger');

    await mod.writeUserOperationFailedLog({} as never, {
      actionKey: 'article.aiTranslate.retrySegment',
      source: 'worker/articleTaskStatus',
      err: new Error('429 rate limit'),
      details: '429 rate limit',
      context: { articleId: 'article-1', jobId: 'job-1' },
    });

    expect(writeSystemLogMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        level: 'error',
        category: 'ai_translate',
        message: '重试翻译片段失败：429 rate limit',
        details: '429 rate limit',
        context: expect.objectContaining({
          actionKey: 'article.aiTranslate.retrySegment',
          operationMode: 'deferred',
          operationStage: 'finished',
          operationOutcome: 'error',
        }),
      }),
    );
  });
});
