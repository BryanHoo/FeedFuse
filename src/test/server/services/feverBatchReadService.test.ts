import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mappings: vi.fn(), allIds: vi.fn(), markAll: vi.fn(), setRead: vi.fn(), mapping: vi.fn(),
  createRun: vi.fn(), createItems: vi.fn(), listTasks: vi.fn(), lockRun: vi.fn(), retryItems: vi.fn(),
  claim: vi.fn(), finish: vi.fn(), client: vi.fn(), insert: vi.fn(), ensure: vi.fn(),
}));
vi.mock('@/server/domains/fever/repositories/feverMappingsRepo', () => ({
  listUnreadActiveFeverItemMappings: mocks.mappings, listAllFeverMappedArticleIds: mocks.allIds,
  getFeverItemMappingByLocalArticleId: mocks.mapping,
}));
vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({ markAllRead: mocks.markAll, setArticleRead: mocks.setRead }));
vi.mock('@/server/domains/fever/repositories/feverBatchReadRepo', () => ({
  createBatchReadRun: mocks.createRun, createBatchReadItems: mocks.createItems, listBatchReadTasks: mocks.listTasks,
  lockBatchReadRun: mocks.lockRun, resetFailedBatchReadItems: mocks.retryItems,
  claimBatchReadItem: mocks.claim, finishBatchReadItem: mocks.finish,
}));
vi.mock('@/server/domains/fever/services/feverWritebackService', () => ({ createClientForAccount: mocks.client }));
vi.mock('@/server/infra/queue/boss', () => ({ startBoss: async () => ({ insert: mocks.insert }) }));
vi.mock('@/server/infra/queue/bootstrap', () => ({ ensureQueue: mocks.ensure }));

const item = { runId: '7', articleId: '11', userId: '2', feverAccountId: '3', feverItemId: 'r11', attempt: 1 };
const query = vi.fn();
const release = vi.fn();
const db = { query, release };
const pool = { connect: async () => db } as never;

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  query.mockReset().mockResolvedValue({ rows: [] });
  release.mockReset();
  mocks.insert.mockResolvedValue(['job-1']);
  mocks.mappings.mockResolvedValue([{ localArticleId: '11', feverAccountId: '3', feverItemId: 'r11' }]);
  mocks.allIds.mockResolvedValue(['11', '12']);
  mocks.markAll.mockResolvedValue(2);
  mocks.createRun.mockResolvedValue('7');
  mocks.createItems.mockResolvedValue([item]);
  mocks.listTasks.mockResolvedValue([{ id: '7', status: 'queued' }]);
  mocks.claim.mockResolvedValue(item);
  mocks.finish.mockResolvedValue(true);
  mocks.mapping.mockResolvedValue({ feverAccountId: '3', feverItemId: 'r11' });
});

describe('Fever 批量已读后台任务', () => {
  it('只创建持久化逐项任务，不在请求内等待远端', async () => {
    const { startFeverBatchRead } = await import('@/server/domains/fever/services/feverBatchReadService');
    const result = await startFeverBatchRead(pool, { userId: '2', feedId: '5' });
    expect(result).toEqual({ updatedCount: 2, task: { id: '7', status: 'queued' } });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.markAll).toHaveBeenCalledWith(db, { userId: '2', feedId: '5', excludeArticleIds: ['11', '12'] });
    expect(mocks.insert).toHaveBeenCalledWith('fever.batch_read_item', [{ data: item }], expect.objectContaining({ db: expect.any(Object) }));
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('入队失败时回滚本地修改及任务记录', async () => {
    mocks.insert.mockRejectedValue(new Error('queue unavailable'));
    const { startFeverBatchRead } = await import('@/server/domains/fever/services/feverBatchReadService');
    await expect(startFeverBatchRead(pool, { userId: '2' })).rejects.toThrow('queue unavailable');
    expect(query).toHaveBeenLastCalledWith('rollback');
    expect(release).toHaveBeenCalledOnce();
  });

  it('每篇远端成功后在同一事务内记录本地已读和成功状态', async () => {
    const markItem = vi.fn().mockResolvedValue(undefined);
    mocks.client.mockResolvedValue({ markItem });
    const { runFeverBatchReadItem } = await import('@/server/domains/fever/services/feverBatchReadService');
    await runFeverBatchReadItem(pool, item);
    expect(markItem).toHaveBeenCalledWith({ itemId: 'r11', as: 'read' });
    expect(mocks.setRead).toHaveBeenCalledWith(db, '11', true, '2');
    expect(mocks.finish).toHaveBeenCalledWith(db, item, 'succeeded', null);
    expect(markItem.mock.invocationCallOrder[0]).toBeLessThan(mocks.setRead.mock.invocationCallOrder[0]);
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('失败只结算当前文章，后续文章继续执行，成功项不会重新写回', async () => {
    const markItem = vi.fn().mockRejectedValueOnce(new Error('Fever 请求超时，请重试')).mockResolvedValue(undefined);
    mocks.client.mockResolvedValue({ markItem });
    const { runFeverBatchReadItem } = await import('@/server/domains/fever/services/feverBatchReadService');
    await runFeverBatchReadItem(pool, item);
    expect(mocks.setRead).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(pool, item, 'failed', 'Fever 请求超时，请重试');
    await runFeverBatchReadItem(pool, { ...item, articleId: '12' });
    expect(mocks.setRead).toHaveBeenCalledOnce();
    mocks.claim.mockResolvedValue(null);
    await runFeverBatchReadItem(pool, item);
    expect(markItem).toHaveBeenCalledTimes(2);
  });

  it('任务执行时重新校验映射，禁止失效来源走本地兜底', async () => {
    mocks.mapping.mockResolvedValue(null);
    const { runFeverBatchReadItem } = await import('@/server/domains/fever/services/feverBatchReadService');
    await runFeverBatchReadItem(pool, item);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.setRead).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(pool, item, 'failed', expect.stringContaining('失效'));
  });

  it('重试仅入队锁定用户任务内的失败项', async () => {
    mocks.lockRun.mockResolvedValue(true);
    mocks.retryItems.mockResolvedValue([{ ...item, attempt: 2 }]);
    const { retryFeverBatchRead } = await import('@/server/domains/fever/services/feverBatchReadService');
    await retryFeverBatchRead(pool, { runId: '7', userId: '2' });
    expect(mocks.lockRun).toHaveBeenCalledWith(db, '7', '2');
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.calls[0][1][0].data.attempt).toBe(2);
  });
});
