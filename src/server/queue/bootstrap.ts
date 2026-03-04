import type { PgBoss } from 'pg-boss';
import { QUEUE_CONTRACTS } from './contracts';

type BossQueueBootstrapSource = Pick<PgBoss, 'createQueue'>;

export async function bootstrapQueues(boss: BossQueueBootstrapSource) {
  for (const [name, contract] of Object.entries(QUEUE_CONTRACTS)) {
    await boss.createQueue(name, contract.queue);
    if (contract.queue.deadLetter) {
      await boss.createQueue(contract.queue.deadLetter, {});
    }
  }
}
