import type { PgBoss } from 'pg-boss';
import { QUEUE_CONTRACTS } from './contracts';

type BossQueueBootstrapSource = Pick<PgBoss, 'createQueue'>;

export async function bootstrapQueues(boss: BossQueueBootstrapSource) {
  const deadLetters = new Set<string>();
  for (const contract of Object.values(QUEUE_CONTRACTS)) {
    const deadLetter = contract.queue.deadLetter;
    if (deadLetter) deadLetters.add(deadLetter);
  }

  for (const deadLetter of deadLetters) {
    await boss.createQueue(deadLetter, {});
  }

  for (const [name, contract] of Object.entries(QUEUE_CONTRACTS)) {
    await boss.createQueue(name, contract.queue);
  }
}
