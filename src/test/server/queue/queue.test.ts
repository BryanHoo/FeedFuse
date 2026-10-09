import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUEUE_CONTRACTS } from '@/server/infra/queue/contracts';
import { createBossFixture } from './bossFixture';

const startBossMock = vi.fn();

vi.mock('@/server/infra/queue/boss', () => ({
  startBoss: (...args: unknown[]) => startBossMock(...args),
}));

describe('queue enqueueWithResult', () => {
  beforeEach(() => {
    startBossMock.mockReset();
    vi.resetModules();
  });

  it('returns throttled_or_duplicate when send resolves null', async () => {
    startBossMock.mockResolvedValue({
      createQueue: vi.fn().mockResolvedValue(undefined),
      updateQueue: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(null),
    });

    const mod = await import('@/server/infra/queue/queue');
    const res = await mod.enqueueWithResult('ai.summarize_article', { articleId: 'a1' }, {});
    expect(res).toEqual({ status: 'throttled_or_duplicate' });
  });

  it('keeps legacy enqueue API returning jobId', async () => {
    startBossMock.mockResolvedValue({
      createQueue: vi.fn().mockResolvedValue(undefined),
      updateQueue: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue('job-1'),
    });

    const mod = await import('@/server/infra/queue/queue');
    await expect(mod.enqueue('feed.fetch', { feedId: 'f1' }, {})).resolves.toBe('job-1');
  });

  it('applies the contract and prepares the dead-letter queue when Web enqueues before Worker boot', async () => {
    const boss = createBossFixture();
    const options = { singletonKey: 'user:article', retryLimit: 0 };
    boss.send.mockImplementation(async (name) => {
      expect(boss.queues.get(name)).toEqual(QUEUE_CONTRACTS[name].queue);
      return 'job-1';
    });
    startBossMock.mockResolvedValue(boss);

    const { enqueueWithResult } = await import('@/server/infra/queue/queue');
    await enqueueWithResult('article.filter', { articleId: 'a1' }, options);

    expect(boss.queues.has('dlq.article.filter')).toBe(true);
    expect(boss.send).toHaveBeenCalledWith('article.filter', { articleId: 'a1' }, options);
  });

  it('shares in-flight initialization and waits for configuration before concurrent sends', async () => {
    const boss = createBossFixture();
    const updateQueue = boss.updateQueue.getMockImplementation()!;
    let finishUpdate!: () => void;
    const updateFinished = new Promise<void>((resolve) => { finishUpdate = resolve; });
    boss.updateQueue.mockImplementation(async (name, options) => {
      await updateFinished;
      await updateQueue(name, options);
    });
    startBossMock.mockResolvedValue(boss);
    const { enqueueWithResult } = await import('@/server/infra/queue/queue');

    const pending = Promise.all([
      enqueueWithResult('article.filter', { articleId: 'a1' }),
      enqueueWithResult('article.filter', { articleId: 'a2' }),
    ]);
    await vi.waitFor(() => expect(boss.updateQueue).toHaveBeenCalledTimes(1));
    expect(boss.send).not.toHaveBeenCalled();
    finishUpdate();
    await pending;
    await enqueueWithResult('article.filter', { articleId: 'a3' });

    expect(boss.createQueue).toHaveBeenCalledTimes(2);
    expect(boss.updateQueue).toHaveBeenCalledTimes(1);
    expect(boss.send).toHaveBeenCalledTimes(3);
  });

  it('does not send after an update failure and retries initialization on the next enqueue', async () => {
    const boss = createBossFixture();
    boss.updateQueue.mockRejectedValueOnce(new Error('configuration update failed'));
    startBossMock.mockResolvedValue(boss);
    const { enqueueWithResult } = await import('@/server/infra/queue/queue');

    await expect(enqueueWithResult('article.filter', {})).rejects.toThrow('configuration update failed');
    expect(boss.send).not.toHaveBeenCalled();
    await expect(enqueueWithResult('article.filter', {})).resolves.toEqual({ status: 'enqueued', jobId: 'job-1' });
    expect(boss.queues.get('article.filter')).toEqual(QUEUE_CONTRACTS['article.filter'].queue);
  });

  it('initializes each boss instance independently when the queue name is the same', async () => {
    const firstBoss = createBossFixture();
    const secondBoss = createBossFixture();
    startBossMock.mockResolvedValueOnce(firstBoss).mockResolvedValueOnce(secondBoss);
    const { enqueueWithResult } = await import('@/server/infra/queue/queue');

    await enqueueWithResult('article.filter', {});
    await expect(enqueueWithResult('article.filter', {})).resolves.toEqual({ status: 'enqueued', jobId: 'job-1' });
    expect(secondBoss.queues.get('article.filter')).toEqual(QUEUE_CONTRACTS['article.filter'].queue);
  });

  it('shares initialization with Worker bootstrap', async () => {
    const boss = createBossFixture();
    startBossMock.mockResolvedValue(boss);
    const { bootstrapQueues } = await import('@/server/infra/queue/bootstrap');
    const { enqueueWithResult } = await import('@/server/infra/queue/queue');

    await bootstrapQueues(boss);
    const creates = boss.createQueue.mock.calls.length;
    const updates = boss.updateQueue.mock.calls.length;
    await enqueueWithResult('article.filter', {});

    expect(boss.createQueue).toHaveBeenCalledTimes(creates);
    expect(boss.updateQueue).toHaveBeenCalledTimes(updates);
  });

  it('keeps default creation for queues without a contract', async () => {
    const boss = createBossFixture();
    startBossMock.mockResolvedValue(boss);
    const { enqueueWithResult } = await import('@/server/infra/queue/queue');

    await expect(enqueueWithResult('custom.queue', {})).resolves.toEqual({ status: 'enqueued', jobId: 'job-1' });
    expect(boss.queues.get('custom.queue')).toEqual({});
    expect(boss.updateQueue).not.toHaveBeenCalled();
  });
});
