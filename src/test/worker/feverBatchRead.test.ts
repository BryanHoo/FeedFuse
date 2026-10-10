import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ run: vi.fn(), finish: vi.fn() }));
vi.mock('@/server/domains/fever/services/feverBatchReadService', () => ({ runFeverBatchReadItem: mocks.run }));
vi.mock('@/server/domains/fever/repositories/feverBatchReadRepo', () => ({ finishBatchReadItem: mocks.finish }));
import { runFeverBatchReadWorker } from '@/worker/feverBatchRead';
const data = { userId: '2', runId: '7', articleId: '11', feverAccountId: '3', feverItemId: 'r11', attempt: 1 };
beforeEach(() => { mocks.run.mockReset(); mocks.finish.mockReset(); });
describe('Fever 批量任务恢复', () => {
  it('入库异常交给队列重试，不提前宣告业务失败', async () => {
    mocks.run.mockRejectedValue(new Error('database unavailable'));
    await expect(runFeverBatchReadWorker({} as never, { data, retryCount: 0, retryLimit: 3 })).rejects.toThrow('database unavailable');
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('耗尽真实队列预算后记录可重试的失败项', async () => {
    mocks.run.mockRejectedValue(new Error('database unavailable'));
    const pool = {} as never;
    await expect(runFeverBatchReadWorker(pool, { data, retryCount: 1, retryLimit: 1 })).rejects.toThrow('database unavailable');
    expect(mocks.finish).toHaveBeenCalledWith(pool, data, 'failed', '保存已读结果失败，请重试');
  });
  it('拒绝缺少用户身份或无效版本的消息', async () => {
    await expect(runFeverBatchReadWorker({} as never, { data: { ...data, userId: undefined } })).rejects.toThrow();
    await expect(runFeverBatchReadWorker({} as never, { data: { ...data, attempt: 0 } })).rejects.toThrow();
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
