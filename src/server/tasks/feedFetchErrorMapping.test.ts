import { describe, expect, it } from 'vitest';

describe('feedFetchErrorMapping', () => {
  it('maps timeout-like errors to a user-facing timeout message', async () => {
    const mod = await import('./feedFetchErrorMapping');

    expect(mod.mapFeedFetchError(new Error('timeout'))).toEqual({
      errorCode: 'fetch_timeout',
      errorMessage: '更新失败：请求超时',
    });
  });

  it('maps HTTP status errors to a stable message', async () => {
    const mod = await import('./feedFetchErrorMapping');

    expect(mod.mapFeedFetchError('HTTP 403')).toEqual({
      errorCode: 'fetch_http_error',
      errorMessage: '更新失败：源站拒绝访问（HTTP 403）',
    });
  });

  it('maps Unsafe URL to a safe message', async () => {
    const mod = await import('./feedFetchErrorMapping');

    expect(mod.mapFeedFetchError('Unsafe URL')).toEqual({
      errorCode: 'ssrf_blocked',
      errorMessage: '更新失败：地址不安全',
    });
  });
});
