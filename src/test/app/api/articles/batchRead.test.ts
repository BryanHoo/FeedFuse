import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), start: vi.fn(), retry: vi.fn(), list: vi.fn(), started: vi.fn(), succeeded: vi.fn(), failed: vi.fn() }));
const pool = {};
vi.mock('@/server/domains/auth/services/session', () => ({ requireApiSession: mocks.session }));
vi.mock('@/server/infra/db/pool', () => ({ getPool: () => pool }));
vi.mock('@/server/domains/fever/services/feverBatchReadService', () => ({ startFeverBatchRead: mocks.start, retryFeverBatchRead: mocks.retry }));
vi.mock('@/server/domains/fever/repositories/feverBatchReadRepo', () => ({ listBatchReadTasks: mocks.list }));
vi.mock('@/server/infra/logging/userOperationLogger', () => ({ writeUserOperationStartedLog: mocks.started, writeUserOperationSucceededLog: mocks.succeeded, writeUserOperationFailedLog: mocks.failed }));
beforeEach(() => { Object.values(mocks).forEach(m => m.mockReset()); mocks.session.mockResolvedValue({ userId: '2' }); });
describe('批量已读 API', () => {
  it('立即返回 202 和后台任务，不宣告整个批次成功', async () => {
    mocks.start.mockResolvedValue({ updatedCount: 3, task: { id: '7', status: 'queued' } });
    const { POST } = await import('@/app/api/articles/mark-all-read/route');
    const res = await POST(new Request('http://localhost/api/articles/mark-all-read', { method: 'POST', body: JSON.stringify({ feedId: '5' }) }));
    expect(res.status).toBe(202);
    expect((await res.json()).data.task.id).toBe('7');
    expect(mocks.start).toHaveBeenCalledWith(pool, { userId: '2', feedId: '5' });
    expect(mocks.succeeded).not.toHaveBeenCalled();
  });
  it('恢复任务列表时使用当前会话用户并禁止缓存', async () => {
    mocks.list.mockResolvedValue([{ id: '7' }]);
    const { GET } = await import('@/app/api/articles/mark-all-read/route');
    const res = await GET();
    expect(mocks.list).toHaveBeenCalledWith(pool, '2');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });
  it('重试不接受客户端用户身份，并拒绝非法批次 ID', async () => {
    mocks.retry.mockResolvedValue({ id: '7' });
    const { POST } = await import('@/app/api/articles/mark-all-read/[id]/retry/route');
    const request = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ userId: '3' }) });
    expect((await POST(request, { params: Promise.resolve({ id: '7' }) })).status).toBe(202);
    expect(mocks.retry).toHaveBeenCalledWith(pool, { runId: '7', userId: '2' });
    expect((await POST(request, { params: Promise.resolve({ id: 'invalid' }) })).status).toBe(400);
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
});
