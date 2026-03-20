import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { registerWorkers } from './workerRegistry';

describe('registerWorkers', () => {
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
