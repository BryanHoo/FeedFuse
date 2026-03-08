import type { ArticleTaskType } from '../repositories/articleTasksRepo';

function toSafeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getErrorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || err.name || '';
  return '';
}

export function mapTaskError(input: {
  type: ArticleTaskType;
  err: unknown;
}): { errorCode: string; errorMessage: string } {
  const text = getErrorText(input.err);
  const safe = toSafeMessage(text);

  // Shared / cross-task
  if (safe === 'Fulltext pending') {
    return { errorCode: 'fulltext_pending', errorMessage: '全文还没准备好，请稍后再试' };
  }

  if (input.type === 'fulltext') {
    if (safe === 'timeout') return { errorCode: 'fetch_timeout', errorMessage: '抓取超时，请稍后重试' };
    if (/^HTTP\s+\d+/.test(safe)) {
      return { errorCode: 'fetch_http_error', errorMessage: `请求失败（${safe}）` };
    }
    if (safe === 'Non-HTML response') {
      return { errorCode: 'fetch_non_html', errorMessage: '返回内容不是可阅读的网页' };
    }
    if (safe === 'Unsafe URL') return { errorCode: 'ssrf_blocked', errorMessage: '链接地址不安全' };
    if (safe === 'Readability parse failed') {
      return { errorCode: 'parse_failed', errorMessage: '暂时无法解析正文' };
    }
    return { errorCode: 'unknown_error', errorMessage: '暂时无法完成处理，请稍后重试' };
  }

  // AI summarize / translate
  if (input.err instanceof Error) {
    const name =
      typeof (input.err as { name?: unknown }).name === 'string'
        ? (input.err as { name: string }).name
        : '';
    if (name === 'AbortError') return { errorCode: 'ai_timeout', errorMessage: '处理超时，请稍后重试' };
  }

  if (/429|rate limit/i.test(safe)) {
    return { errorCode: 'ai_rate_limited', errorMessage: '请求太频繁了，请稍后重试' };
  }
  if (/401|unauthorized|api key/i.test(safe)) {
    return { errorCode: 'ai_invalid_config', errorMessage: 'AI 配置无效，请检查 API 密钥' };
  }
  if (/Invalid .*response/i.test(safe)) {
    return { errorCode: 'ai_bad_response', errorMessage: 'AI 返回结果异常，请稍后重试' };
  }

  return { errorCode: 'unknown_error', errorMessage: '暂时无法完成处理，请稍后重试' };
}

