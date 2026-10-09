import type { PgBoss } from 'pg-boss';
import { getQueueCreateOptions, QUEUE_CONTRACTS } from '@/server/infra/queue/contracts';

type BossQueueBootstrapSource = Pick<PgBoss, 'createQueue' | 'updateQueue'>;

// Web 入队和 Worker 启动共用初始化状态；按实例隔离，避免复用其他连接的结果。
const ensureQueuePromises = new WeakMap<BossQueueBootstrapSource, Map<string, Promise<void>>>();

export async function ensureQueue(boss: BossQueueBootstrapSource, name: string): Promise<void> {
  let promises = ensureQueuePromises.get(boss);
  if (!promises) {
    promises = new Map();
    ensureQueuePromises.set(boss, promises);
  }

  let promise = promises.get(name);
  if (!promise) {
    const options = getQueueCreateOptions(name);
    promise = (async () => {
      // pg-boss 要求被引用的死信队列先存在，Web 首次入队也必须遵守这个顺序。
      if (options.deadLetter) await ensureQueue(boss, options.deadLetter);
      await boss.createQueue(name, options);
      // 12.13.0 的 createQueue 不更新已有队列，必须显式同步当前契约。
      // 无契约的队列沿用默认配置；updateQueue 不接受空配置对象。
      if (Object.keys(options).length > 0) await boss.updateQueue(name, options);
    })().catch((err) => {
      // 创建或更新失败后清除缓存，下一次调用可以重试；成功后复用完成的 Promise。
      promises.delete(name);
      throw err;
    });
    promises.set(name, promise);
  }

  await promise;
}

export async function bootstrapQueues(boss: BossQueueBootstrapSource) {
  const deadLetters = new Set<string>();
  for (const contract of Object.values(QUEUE_CONTRACTS)) {
    const deadLetter = contract.queue.deadLetter;
    if (deadLetter) deadLetters.add(deadLetter);
  }

  for (const deadLetter of deadLetters) {
    await ensureQueue(boss, deadLetter);
  }

  for (const name of Object.keys(QUEUE_CONTRACTS)) {
    await ensureQueue(boss, name);
  }
}
