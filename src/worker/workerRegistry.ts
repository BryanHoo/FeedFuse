import type { PgBoss } from 'pg-boss';
import { getWorkerOptions } from '../server/queue/contracts';

type BossWorkerRegistrationSource = Pick<PgBoss, 'work'>;

export async function registerWorkers(
  boss: BossWorkerRegistrationSource,
  handlers: Record<string, (jobs: unknown[]) => Promise<void>>,
) {
  for (const [name, handler] of Object.entries(handlers)) {
    await boss.work(name, getWorkerOptions(name), handler);
  }
}
