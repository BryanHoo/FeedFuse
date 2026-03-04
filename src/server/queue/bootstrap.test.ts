import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { bootstrapQueues } from './bootstrap';

describe('bootstrapQueues', () => {
  it('creates queues and dead-letter queues from contracts', async () => {
    const createQueue = vi.fn().mockResolvedValue(undefined);

    await bootstrapQueues({
      createQueue,
    } as unknown as Pick<PgBoss, 'createQueue'>);

    expect(createQueue).toHaveBeenCalledWith('article.fetch_fulltext', expect.any(Object));
    expect(createQueue).toHaveBeenCalledWith('dlq.article.fulltext', expect.any(Object));
  });
});
