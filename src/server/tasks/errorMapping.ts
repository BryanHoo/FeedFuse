import type { ArticleTaskType } from '../repositories/articleTasksRepo';
import { extractErrorText, toRawErrorMessage } from './rawErrorMessage';

function toSafeMessage(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function getErrorText(err: unknown): string {
  return extractErrorText(err) ?? '';
}

export function mapTaskError(input: {
  type: ArticleTaskType;
  err: unknown;
}): { errorCode: string; errorMessage: string; rawErrorMessage: string | null } {
  const text = getErrorText(input.err);
  const safe = toSafeMessage(text);
  const rawErrorMessage = toRawErrorMessage(input.err);
  const result = (errorCode: string, errorMessage: string) => ({
    errorCode,
    errorMessage,
    rawErrorMessage,
  });

  // Shared / cross-task
  if (safe === 'Fulltext pending') {
    return result('fulltext_pending', '全文还没准备好，请稍后再试');
  }

  if (input.type === 'fulltext') {
    if (safe === 'timeout') return result('fetch_timeout', '抓取超时，请稍后重试');
    if (/^HTTP\s+\d+/.test(safe)) {
      return result('fetch_http_error', `请求失败（${safe}）`);
    }
    if (safe === 'Non-HTML response') {
      return result('fetch_non_html', '返回内容不是可阅读的网页');
    }
    if (safe === 'Unsafe URL') return result('ssrf_blocked', '链接地址不安全');
    if (safe === 'Readability parse failed') {
      return result('parse_failed', '暂时无法解析正文');
    }
    return result('unknown_error', '暂时无法完成处理，请稍后重试');
  }

  // AI summarize / translate
  if (input.err instanceof Error) {
    const name =
      typeof (input.err as { name?: unknown }).name === 'string'
        ? (input.err as { name: string }).name
        : '';
    if (name === 'AbortError') return result('ai_timeout', '处理超时，请稍后重试');
  }

  if (/429|rate limit/i.test(safe)) {
    return result('ai_rate_limited', '请求太频繁了，请稍后重试');
  }
  if (/401|unauthorized|api key/i.test(safe)) {
    return result('ai_invalid_config', 'AI 配置无效，请检查 API 密钥');
  }
  if (/Invalid .*response/i.test(safe)) {
    return result('ai_bad_response', 'AI 返回结果异常，请稍后重试');
  }

  return result('unknown_error', '暂时无法完成处理，请稍后重试');
}
