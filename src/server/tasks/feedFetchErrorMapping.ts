function toSafeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Unknown error';
  return 'Unknown error';
}

export function mapFeedFetchError(err: unknown): { errorCode: string; errorMessage: string } {
  const safe = toSafeMessage(getErrorText(err));

  if (safe === 'Unsafe URL') {
    return { errorCode: 'ssrf_blocked', errorMessage: '更新失败：地址不安全' };
  }
  if (/timeout/i.test(safe)) {
    return { errorCode: 'fetch_timeout', errorMessage: '更新失败：请求超时' };
  }
  if (/^HTTP\s+403$/.test(safe)) {
    return {
      errorCode: 'fetch_http_error',
      errorMessage: '更新失败：源站拒绝访问（HTTP 403）',
    };
  }
  if (/^HTTP\s+\d+$/.test(safe)) {
    return {
      errorCode: 'fetch_http_error',
      errorMessage: `更新失败：请求异常（${safe}）`,
    };
  }
  if (/parse/i.test(safe) || /xml/i.test(safe) || /rss/i.test(safe)) {
    return { errorCode: 'parse_failed', errorMessage: '更新失败：RSS 解析失败' };
  }

  return { errorCode: 'unknown_error', errorMessage: '更新失败：发生未知错误' };
}
