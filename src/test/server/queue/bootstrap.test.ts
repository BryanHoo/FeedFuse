import { describe, expect, it } from 'vitest';
import { bootstrapQueues } from '@/server/infra/queue/bootstrap';
import { QUEUE_CONTRACTS } from '@/server/infra/queue/contracts';
import { createBossFixture } from './bossFixture';

describe('bootstrapQueues', () => {
  it('creates queues and dead-letter queues from contracts', async () => {
    const { createQueue, updateQueue } = createBossFixture();

    await bootstrapQueues({
      createQueue,
      updateQueue,
    });

    expect(createQueue).toHaveBeenCalledWith('article.filter', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('dlq.article.filter', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('article.fetch_fulltext', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('dlq.article.fulltext', expect.any(Object));
  });

  it('creates dead-letter queue before queue that references it', async () => {
    const { createQueue, updateQueue } = createBossFixture();

    await bootstrapQueues({
      createQueue,
      updateQueue,
    });

    const callNames = createQueue.mock.calls.map((call) => String(call[0]));
    const articleFilterIndex = callNames.indexOf('article.filter');
    const articleFilterDlqIndex = callNames.indexOf('dlq.article.filter');
    const feedIndex = callNames.indexOf('feed.fetch');
    const feedDlqIndex = callNames.indexOf('dlq.feed.fetch');
    const fulltextIndex = callNames.indexOf('article.fetch_fulltext');
    const fulltextDlqIndex = callNames.indexOf('dlq.article.fulltext');

    expect(articleFilterDlqIndex).toBeGreaterThanOrEqual(0);
    expect(feedDlqIndex).toBeGreaterThanOrEqual(0);
    expect(fulltextDlqIndex).toBeGreaterThanOrEqual(0);
    expect(articleFilterDlqIndex).toBeLessThan(articleFilterIndex);
    expect(feedDlqIndex).toBeLessThan(feedIndex);
    expect(fulltextDlqIndex).toBeLessThan(fulltextIndex);
  });

  it('updates existing queues instead of retaining defaults or old configuration', async () => {
    const boss = createBossFixture(new Map([
      ['article.filter', {
        retryLimit: 0,
        retryDelay: 0,
        retryBackoff: false,
        retryDelayMax: 10,
        heartbeatSeconds: 10,
        expireInSeconds: 60,
        deadLetter: 'dlq.old',
        warningQueueSize: 1,
      }],
      ['ai.summarize_article', {}],
    ]));

    await bootstrapQueues(boss);

    for (const [name, contract] of Object.entries(QUEUE_CONTRACTS)) {
      expect(boss.queues.get(name)).toEqual(contract.queue);
    }
    expect(boss.updateQueue).toHaveBeenCalledWith('article.filter', QUEUE_CONTRACTS['article.filter'].queue);
    // 死信队列没有契约配置，不能向 updateQueue 传空对象。
    expect(boss.updateQueue.mock.calls.every(([, options]) => Object.keys(options).length > 0)).toBe(true);
  });
});
