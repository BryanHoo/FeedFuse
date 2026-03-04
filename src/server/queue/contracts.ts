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
}

type SendContext = {
  articleId?: string;
  feedId?: string;
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
    worker: { localConcurrency: 3, batchSize: 1 },
    send: () => ({}),
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
    send: (ctx) => ({ singletonKey: ctx.articleId, singletonSeconds: 600 }),
  },
  'ai.summarize_article': {
    queue: { heartbeatSeconds: 60, expireInSeconds: 1800, warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) => ({ singletonKey: ctx.articleId, singletonSeconds: 600, retryLimit: 0 }),
  },
  'ai.translate_article_zh': {
    queue: { heartbeatSeconds: 60, expireInSeconds: 1800, warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) => ({ singletonKey: ctx.articleId, singletonSeconds: 600, retryLimit: 0 }),
  },
  'ai.translate_title_zh': {
    queue: { warningQueueSize: 300 },
    worker: { localConcurrency: 2, batchSize: 1 },
    send: (ctx) => ({ singletonKey: ctx.articleId, singletonSeconds: 600, retryLimit: 0 }),
  },
  'feed.refresh_all': {
    queue: { warningQueueSize: 50 },
    worker: { localConcurrency: 1, batchSize: 1 },
    send: () => ({}),
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
