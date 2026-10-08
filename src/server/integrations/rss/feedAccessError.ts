export class FeedAccessBlockedError extends Error {
  override name = 'FeedAccessBlockedError';

  constructor(cause?: unknown) {
    super('源站返回了安全验证页面，暂时无法获取订阅内容，请稍后重试或使用其他订阅地址', { cause });
  }
}

export function isFeedAccessBlockedError(error: unknown): error is Error {
  return error instanceof Error && error.name === 'FeedAccessBlockedError';
}
