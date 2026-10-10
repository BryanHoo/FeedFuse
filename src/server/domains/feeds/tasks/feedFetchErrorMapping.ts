import { toRawErrorMessage } from '@/server/domains/settings/tasks/rawErrorMessage';
import { isFeedAccessBlockedError } from '@/server/integrations/rss/feedAccessError';

function toSafeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || '';
  return '';
}

export function mapFeedFetchError(
  err: unknown,
): { errorCode: string; errorMessage: string; rawErrorMessage: string | null } {
  const safe = toSafeMessage(getErrorText(err));
  const rawErrorMessage = toRawErrorMessage(err);
  const result = (errorCode: string, errorMessage: string) => ({
    errorCode,
    errorMessage,
    rawErrorMessage,
  });

  if (isFeedAccessBlockedError(err)) {
    return result('fetch_access_blocked', `更新失败：${safe}`);
  }

  if (safe === 'Unsafe URL') {
    return result('ssrf_blocked', '更新失败：订阅地址不安全');
  }
  if (/timeout/i.test(safe)) {
    return result('fetch_timeout', '更新失败：请求超时，请稍后重试');
  }
  if (/^HTTP\s+403$/.test(safe)) {
    return result('fetch_http_error', '更新失败：源站拒绝访问（HTTP 403）');
  }
  if (/^HTTP\s+\d+$/.test(safe)) {
    return result('fetch_http_error', `更新失败：服务器返回 ${safe}`);
  }
  if (/parse/i.test(safe) || /xml/i.test(safe) || /rss/i.test(safe)) {
    return result('parse_failed', '更新失败：无法解析 RSS 内容');
  }

  return result('unknown_error', '更新失败：暂时无法获取订阅内容');
}

export function shouldRetryFeedFetchError(err: unknown): boolean {
  const message = getErrorText(err);
  if (isFeedAccessBlockedError(err)) return false;
  // 地址安全、响应大小和重定向限制不会因短暂等待恢复；超时/网络异常默认重试。
  if (['Unsafe URL', 'Response too large', 'Too many redirects'].includes(message)) return false;
  const httpStatus = /^HTTP\s+(\d+)$/.exec(message);
  if (httpStatus) {
    const status = Number(httpStatus[1]);
    return [408, 425, 429].includes(status) || status >= 500;
  }
  // 数据库、队列及未分类基础设施错误保留有限重试机会，避免被误报为完成。
  return true;
}

export class RetryableFeedFetchError extends Error {
  readonly mapped: ReturnType<typeof mapFeedFetchError>;

  constructor(
    cause: unknown,
    readonly userId: string,
    readonly status: number | null,
    mapped = mapFeedFetchError(cause),
  ) {
    super(getErrorText(cause) || 'RSS fetch failed', { cause });
    this.name = 'RetryableFeedFetchError';
    this.mapped = mapped;
  }
}
