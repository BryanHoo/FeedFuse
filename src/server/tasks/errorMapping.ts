import type { ArticleTaskType } from '../repositories/articleTasksRepo';

function toSafeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || 'Unknown error';
  return 'Unknown error';
}

export function mapTaskError(input: {
  type: ArticleTaskType;
  err: unknown;
}): { errorCode: string; errorMessage: string } {
  const text = getErrorText(input.err);
  const safe = toSafeMessage(text);

  // Shared / cross-task
  if (safe === 'Fulltext pending') {
    return { errorCode: 'fulltext_pending', errorMessage: '全文未就绪，请稍后重试' };
  }

  if (input.type === 'fulltext') {
    if (safe === 'timeout') return { errorCode: 'fetch_timeout', errorMessage: '抓取超时' };
    if (/^HTTP\s+\d+/.test(safe)) return { errorCode: 'fetch_http_error', errorMessage: safe };
    if (safe === 'Non-HTML response') {
      return { errorCode: 'fetch_non_html', errorMessage: '响应不是 HTML' };
    }
    if (safe === 'Unsafe URL') return { errorCode: 'ssrf_blocked', errorMessage: 'URL 不安全' };
    if (safe === 'Readability parse failed') {
      return { errorCode: 'parse_failed', errorMessage: '正文解析失败' };
    }
    return { errorCode: 'unknown_error', errorMessage: safe || 'Unknown error' };
  }

  // AI summarize / translate
  if (input.err instanceof Error) {
    const name =
      typeof (input.err as { name?: unknown }).name === 'string'
        ? (input.err as { name: string }).name
        : '';
    if (name === 'AbortError') return { errorCode: 'ai_timeout', errorMessage: '请求超时' };
  }

  if (/429|rate limit/i.test(safe)) {
    return { errorCode: 'ai_rate_limited', errorMessage: '请求过于频繁，请稍后重试' };
  }
  if (/401|unauthorized|api key/i.test(safe)) {
    return { errorCode: 'ai_invalid_config', errorMessage: 'AI 配置无效，请检查 API Key' };
  }
  if (/Invalid .*response/i.test(safe)) {
    return { errorCode: 'ai_bad_response', errorMessage: 'AI 响应异常，请稍后重试' };
  }

  return { errorCode: 'unknown_error', errorMessage: safe || 'Unknown error' };
}

