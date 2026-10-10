export interface QueueCreateOptions {
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
  retryDelayMax?: number;
  heartbeatSeconds?: number;
  expireInSeconds?: number;
  deadLetter?: string;
  warningQueueSize?: number;
}

export interface WorkerOptions {
  localConcurrency: number;
  batchSize: number;
  pollingIntervalSeconds?: number;
  includeMetadata?: boolean;
}

type SendContext = {
  userId?: string;
  articleId?: string;
  accountId?: string;
  feedId?: string;
  runId?: string;
  force?: boolean;
};

interface QueueContract {
  queue: QueueCreateOptions;
  worker: WorkerOptions;
  send: (ctx: SendContext) => Record<string, unknown>;
}

export const QUEUE_CONTRACTS: Record<string, QueueContract> = {
  'feed.fetch': {
    queue: {
      retryLimit: 4,
      retryDelay: 20,
      retryBackoff: true,
      retryDelayMax: 600,
      deadLetter: 'dlq.feed.fetch',
      warningQueueSize: 200,
    },
    // RSS 终态结算需要任务实际重试预算，包含 send() 的单任务覆盖值。
    worker: { localConcurrency: 3, batchSize: 1, includeMetadata: true },
    send: (ctx) =>
      ctx.runId && ctx.feedId
        ? { singletonKey: [ctx.userId, ctx.runId, ctx.feedId].filter(Boolean).join(':'), singletonSeconds: 3600 }
        : {},
  },
  'article.fetch_fulltext': {
    queue: {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 900,
      deadLetter: 'dlq.article.fulltext',
      heartbeatSeconds: 60,
      expireInSeconds: 1200,
      warningQueueSize: 300,
    },
    worker: { localConcurrency: 4, batchSize: 2 },
    send: (ctx) => ({ singletonKey: [ctx.userId, ctx.articleId].filter(Boolean).join(':'), singletonSeconds: 600 }),
  },
  'article.filter': {
    queue: {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 900,
      deadLetter: 'dlq.article.filter',
      heartbeatSeconds: 60,
      expireInSeconds: 1200,
      warningQueueSize: 300,
    },
    worker: { localConcurrency: 3, batchSize: 1 },
    send: (ctx) => ({ singletonKey: [ctx.userId, ctx.articleId].filter(Boolean).join(':'), singletonSeconds: 600 }),
  },
  'article.filter_recover': {
    queue: { warningQueueSize: 5 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: () => ({ singletonKey: 'article.filter_recover', singletonSeconds: 55 }),
  },
  'ai.summarize_article': {
    queue: { heartbeatSeconds: 60, expireInSeconds: 1800, warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) => ({ singletonKey: [ctx.userId, ctx.articleId].filter(Boolean).join(':'), singletonSeconds: 600, retryLimit: 0 }),
  },
  'ai.translate_article_zh': {
    queue: { heartbeatSeconds: 60, expireInSeconds: 1800, warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) =>
      ctx.force
        ? { retryLimit: 0 }
        : { singletonKey: [ctx.userId, ctx.articleId].filter(Boolean).join(':'), singletonSeconds: 600, retryLimit: 0 },
  },
  'ai.translate_title_zh': {
    // 标题翻译由队列统一重试：首次执行加两次重试，总计最多三次。
    // 显式设置正数延迟，避免临时网络故障时立即重复请求。
    queue: { retryLimit: 2, retryDelay: 30, retryBackoff: true, warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) => ({ singletonKey: [ctx.userId, ctx.articleId].filter(Boolean).join(':'), singletonSeconds: 600 }),
  },
  'ai.digest_tick': {
    queue: { warningQueueSize: 5 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: () => ({ singletonKey: 'ai.digest_tick', singletonSeconds: 55 }),
  },
  'ai.digest_generate': {
    queue: {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      retryDelayMax: 600,
      heartbeatSeconds: 60,
      expireInSeconds: 1800,
      warningQueueSize: 50,
    },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: (ctx) =>
      ctx.runId ? { singletonKey: [ctx.userId, ctx.runId].filter(Boolean).join(':'), singletonSeconds: 3600 } : {},
  },
  'fever.sync': {
    queue: {
      retryLimit: 3,
      retryDelay: 30,
      heartbeatSeconds: 60,
      expireInSeconds: 3600,
      warningQueueSize: 50,
    },
    worker: { localConcurrency: 1, batchSize: 1 },
    // Fever 同步以账号为调度粒度，runId 只做追踪，不能破坏账号级互斥。
    send: (ctx) =>
      ctx.accountId
        ? { singletonKey: [ctx.userId, ctx.accountId].filter(Boolean).join(':'), singletonSeconds: 5 }
        : {},
  },
  'fever.batch_read_item': {
    // 每条任务最多处理一篇文章，避免大批次超过租约；重试仅用于进程或入库故障恢复。
    queue: { retryLimit: 3, retryDelay: 30, retryBackoff: true, expireInSeconds: 120, warningQueueSize: 1000 },
    worker: { localConcurrency: 1, batchSize: 1, includeMetadata: true },
    send: () => ({}),
  },
  'fever.sync_due': {
    queue: { warningQueueSize: 5 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: () => ({ singletonKey: 'fever.sync_due', singletonSeconds: 55 }),
  },
  'feed.refresh_all': {
    queue: { warningQueueSize: 50 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: (ctx) =>
      ctx.runId ? { singletonKey: [ctx.userId, ctx.runId].filter(Boolean).join(':'), singletonSeconds: 3600 } : {},
  },
  'system_logs.cleanup': {
    queue: { warningQueueSize: 5 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: () => ({ singletonKey: 'system_logs.cleanup', singletonSeconds: 3600 }),
  },
};

export function getQueueCreateOptions(name: string): QueueCreateOptions {
  return QUEUE_CONTRACTS[name]?.queue ?? {};
}

export function getWorkerOptions(name: string): WorkerOptions {
  return QUEUE_CONTRACTS[name]?.worker ?? { localConcurrency: 1, batchSize: 1 };
}

export function getQueueSendOptions(
  name: string,
  ctx: SendContext,
): Record<string, unknown> {
  return QUEUE_CONTRACTS[name]?.send(ctx) ?? {};
}
