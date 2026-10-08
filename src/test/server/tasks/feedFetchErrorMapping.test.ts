import { describe, expect, it } from 'vitest';

describe('feedFetchErrorMapping', () => {
  it('maps upstream challenges to an access error rather than a parsing error', async () => {
    const { mapFeedFetchError } = await import('@/server/domains/feeds/tasks/feedFetchErrorMapping');
    const error = new Error('源站返回了安全验证页面，暂时无法获取订阅内容');
    error.name = 'FeedAccessBlockedError';
    expect(mapFeedFetchError(error)).toEqual({
      errorCode: 'fetch_access_blocked',
      errorMessage: `更新失败：${error.message}`,
      rawErrorMessage: error.message,
    });
  });
  it('maps timeout-like errors to a user-facing timeout message', async () => {
    const mod = await import('@/server/domains/feeds/tasks/feedFetchErrorMapping');

    expect(mod.mapFeedFetchError(new Error('timeout'))).toEqual({
      errorCode: 'fetch_timeout',
      errorMessage: '更新失败：请求超时，请稍后重试',
      rawErrorMessage: 'timeout',
    });
  });

  it('maps HTTP status errors to a stable message', async () => {
    const mod = await import('@/server/domains/feeds/tasks/feedFetchErrorMapping');

    expect(mod.mapFeedFetchError('HTTP 403')).toEqual({
      errorCode: 'fetch_http_error',
      errorMessage: '更新失败：源站拒绝访问（HTTP 403）',
      rawErrorMessage: 'HTTP 403',
    });
  });

  it('maps Unsafe URL to a safe message', async () => {
    const mod = await import('@/server/domains/feeds/tasks/feedFetchErrorMapping');

    expect(mod.mapFeedFetchError('Unsafe URL')).toEqual({
      errorCode: 'ssrf_blocked',
      errorMessage: '更新失败：订阅地址不安全',
      rawErrorMessage: 'Unsafe URL',
    });
  });
});
