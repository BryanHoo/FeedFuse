import { describe, expect, it, vi } from 'vitest';
import { runArticleFilterRecovery } from '@/worker/articleFilterRecovery';

function setup() {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  const pool = { connect: vi.fn().mockResolvedValue(client) };
  const boss = {
    send: vi.fn().mockResolvedValue('job-1'),
    findJobs: vi.fn().mockResolvedValue([]),
  };
  const candidate = {
    articleId: '1', userId: '2', fullTextOnFetchEnabled: true,
    aiSummaryOnFetchEnabled: false, bodyTranslateOnFetchEnabled: false, titleTranslateEnabled: true,
  };
  const deps = {
    listPendingArticleFilterIds: vi.fn().mockResolvedValueOnce(['1']).mockResolvedValue([]),
    getPendingArticleFilterForUpdate: vi.fn().mockResolvedValue(candidate),
    getUiSettings: vi.fn().mockResolvedValue({ rss: { articleFilter: { keyword: { enabled: true, keywords: ['test'] } } } }),
  };
  const run = () => runArticleFilterRecovery({ pool: pool as never, boss: boss as never, userId: '2', deps });
  return { client, pool, boss, deps, run };
}

describe('article filter recovery', () => {
  it('repairs historical pending articles with current user settings and transactional queue SQL', async () => {
    const { client, pool, boss, deps, run } = setup();
    boss.send.mockImplementation(async (_name, _data, options) => {
      await options.db.executeSql('queue insert', []);
      return 'job-1';
    });
    expect(await run()).toBe(1);
    expect(deps.getUiSettings).toHaveBeenCalledWith(pool, '2');
    expect(deps.getPendingArticleFilterForUpdate).toHaveBeenCalledWith(client, '1', '2');
    expect(boss.findJobs).toHaveBeenCalledWith('article.filter', expect.objectContaining({
      data: { userId: '2', articleId: '1' }, db: expect.any(Object),
    }));
    expect(boss.send).toHaveBeenCalledWith('article.filter', expect.objectContaining({
      userId: '2', articleId: '1',
      articleFilter: expect.objectContaining({ keyword: expect.objectContaining({ enabled: true }) }),
      feed: expect.objectContaining({ fullTextOnFetchEnabled: true, titleTranslateEnabled: true }),
    }), expect.objectContaining({ singletonKey: '2:1', db: expect.any(Object) }));
    expect(client.query.mock.calls).toEqual([['begin'], ['queue insert', []], ['commit']]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each(['created', 'retry', 'active'])('does not resend while an existing job is %s', async (state) => {
    const { boss, run } = setup();
    boss.findJobs.mockResolvedValue([{ state }]);
    expect(await run()).toBe(0);
    expect(boss.send).not.toHaveBeenCalled();
  });

  it.each(['failed', 'completed', 'cancelled'])('recovers pending articles whose prior job is %s', async (state) => {
    const { boss, run } = setup();
    boss.findJobs.mockResolvedValue([{ state }]);
    expect(await run()).toBe(1);
    expect(boss.send).toHaveBeenCalledOnce();
  });

  it('rechecks pending state under a row lock before sending', async () => {
    const { boss, deps, client, run } = setup();
    deps.getPendingArticleFilterForUpdate.mockResolvedValue(null);
    expect(await run()).toBe(0);
    expect(boss.send).not.toHaveBeenCalled();
    expect(client.query.mock.calls).toEqual([['begin'], ['commit']]);
  });

  it('pages past articles with existing jobs instead of starving later orphans', async () => {
    const { deps, boss, pool, run } = setup();
    deps.listPendingArticleFilterIds.mockReset().mockResolvedValueOnce(['1']).mockResolvedValueOnce(['2']).mockResolvedValue([]);
    boss.findJobs.mockResolvedValueOnce([{ state: 'active' }]).mockResolvedValue([]);
    deps.getPendingArticleFilterForUpdate.mockResolvedValueOnce({ articleId: '1', userId: '2' }).mockResolvedValue({ articleId: '2', userId: '2' });
    expect(await run()).toBe(1);
    expect(deps.listPendingArticleFilterIds.mock.calls).toEqual([
      [pool, { userId: '2', afterId: null, limit: 100 }],
      [pool, { userId: '2', afterId: '1', limit: 100 }],
      [pool, { userId: '2', afterId: '2', limit: 100 }],
    ]);
    expect(boss.send.mock.calls[0][1].articleId).toBe('2');
  });

  it('rolls back on enqueue failure and allows the next scan to retry', async () => {
    const { deps, boss, client, run } = setup();
    boss.send.mockRejectedValueOnce(new Error('queue unavailable')).mockResolvedValue('job-2');
    await expect(run()).rejects.toThrow('queue unavailable');
    expect(client.query.mock.calls).toEqual([['begin'], ['rollback']]);
    expect(client.release).toHaveBeenCalledOnce();
    deps.listPendingArticleFilterIds.mockResolvedValueOnce(['1']).mockResolvedValue([]);
    expect(await run()).toBe(1);
  });

  it('leaves singleton conflicts eligible for the next scan', async () => {
    const { boss, run } = setup();
    boss.send.mockResolvedValue(null);
    expect(await run()).toBe(0);
  });
});
