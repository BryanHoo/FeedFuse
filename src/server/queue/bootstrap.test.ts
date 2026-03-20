import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapQueues } from './bootstrap';

describe('bootstrapQueues', () => {
  it('creates queues and dead-letter queues from contracts', async () => {
    const createQueue = vi.fn().mockResolvedValue(undefined);

    await bootstrapQueues({
      createQueue,
    } as unknown as Pick<PgBoss, 'createQueue'>);

    expect(createQueue).toHaveBeenCalledWith('article.filter', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('dlq.article.filter', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('article.fetch_fulltext', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('dlq.article.fulltext', expect.any(Object));
  });

  it('creates dead-letter queue before queue that references it', async () => {
    const createQueue = vi.fn().mockResolvedValue(undefined);

    await bootstrapQueues({
      createQueue,
    } as unknown as Pick<PgBoss, 'createQueue'>);

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
});
