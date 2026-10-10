import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { registerWorkers } from '../../worker/workerRegistry';

describe('registerWorkers', () => {
  it('includes RSS retry metadata for final failure settlement', async () => {
    const work = vi.fn().mockResolvedValue('worker-id');
    await registerWorkers({ work } as unknown as Pick<PgBoss, 'work'>, {
      'feed.fetch': async () => undefined,
    });
    expect(work).toHaveBeenCalledWith('feed.fetch', expect.objectContaining({
      batchSize: 1, includeMetadata: true,
    }), expect.any(Function));
  });

  it('registers work handlers with contract worker options', async () => {
    const work = vi.fn().mockResolvedValue('worker-id');

    await registerWorkers(
      {
        work,
      } as unknown as Pick<PgBoss, 'work'>,
      {
        'article.filter': async () => undefined,
      },
    );

    expect(work).toHaveBeenCalledWith(
      'article.filter',
      expect.objectContaining({ localConcurrency: 3, batchSize: 1 }),
      expect.any(Function),
    );
  });
});
