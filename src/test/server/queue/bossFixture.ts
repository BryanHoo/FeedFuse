import { vi } from 'vitest';
import type { QueueCreateOptions } from '@/server/infra/queue/contracts';

export function createBossFixture(
  queues = new Map<string, QueueCreateOptions>(),
) {
  return {
    queues,
    // 模拟 pg-boss 12.13.0：创建已有队列时保留旧配置，死信队列必须先存在。
    createQueue: vi.fn(async (name: string, options: QueueCreateOptions = {}) => {
      if (options.deadLetter && !queues.has(options.deadLetter)) {
        throw new Error('Dead-letter queue does not exist');
      }
      if (!queues.has(name)) queues.set(name, { ...options });
    }),
    updateQueue: vi.fn(async (name: string, options: QueueCreateOptions) => {
      if (!Object.keys(options).length) throw new Error('no properties found to update');
      const current = queues.get(name);
      if (!current) throw new Error('Queue does not exist');
      if (options.deadLetter && !queues.has(options.deadLetter)) {
        throw new Error('Dead-letter queue does not exist');
      }
      queues.set(name, { ...current, ...options });
    }),
    // 发送前检查队列存在，防止初始化缓存错误地跨实例复用。
    send: vi.fn(async (name: string) => {
      if (!queues.has(name)) throw new Error('Queue does not exist');
      return 'job-1';
    }),
  };
}
