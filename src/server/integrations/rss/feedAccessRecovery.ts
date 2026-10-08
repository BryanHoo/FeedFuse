import { isIP } from 'node:net';
import Parser from 'rss-parser';
import { FeedAccessBlockedError } from './feedAccessError';
import {
  fetchTextWithValidatedRedirects,
  isTerminalFetchError,
  type FetchExternalTextOptions,
  type FetchTextOkResult,
} from '@/server/infra/http/fetchExternalText';

const parser = new Parser();
const HTML_ROOT = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype\s+html[^>]*>\s*)?<html(?:\s|>)/i;
const CHALLENGE_MARKERS = /_wafchallengeid|_cf_chl_opt|cf-chl-|\/cdn-cgi\/challenge-platform\/|checking your browser|verify (?:that )?you are human|正在进行安全检测|安全验证|人机验证/i;

function isChallengePage(body: string): boolean {
  // 先确认根节点是 HTML，避免文章正文提到 WAF 或包含检测页时误判 RSS。
  return HTML_ROOT.test(body.trimStart()) && CHALLENGE_MARKERS.test(body);
}

function getAlternateUrl(input: string): string | null {
  const url = new URL(input);
  const host = url.hostname;
  // 仅尝试一次 www/裸域变体，不对本机、IP、凭据或自定义端口猜测地址。
  if (
    url.port || url.username || url.password || isIP(host.replace(/^\[|\]$/g, '')) ||
    !host.includes('.') || host === 'host.docker.internal' ||
    /\.(?:localhost|local|test|example|invalid)$/.test(host)
  ) {
    return null;
  }
  url.hostname = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  return url.toString();
}

export async function fetchRssTextWithRecovery(
  url: string,
  options: FetchExternalTextOptions,
): Promise<FetchTextOkResult> {
  const startedAt = Date.now();
  const original = await fetchTextWithValidatedRedirects(url, options);
  if (original.status === 304 || !isChallengePage(original.body)) return original;

  const alternateUrl = getAlternateUrl(original.finalUrl);
  if (!alternateUrl) throw new FeedAccessBlockedError();

  // 换主机后缓存校验器不再适用；每一跳继续执行原有 SSRF、大小和重定向限制。
  const headers = { ...options.headers };
  delete headers['if-none-match'];
  delete headers['if-modified-since'];
  const timeoutMs = options.timeoutMs - (Date.now() - startedAt);
  if (timeoutMs <= 0) throw new DOMException('Request timed out', 'AbortError');
  let alternate: FetchTextOkResult;
  try {
    alternate = await fetchTextWithValidatedRedirects(alternateUrl, {
      ...options,
      timeoutMs,
      headers,
    });
  } catch (error) {
    // 备用主机不存在时仍保留源站受阻的诊断；安全和资源限制必须原样上报。
    if (isTerminalFetchError(error)) throw error;
    throw new FeedAccessBlockedError(error);
  }

  // 备用地址必须真正返回可解析的订阅源，不能把另一个首页或检测页当作恢复成功。
  if (alternate.status < 200 || alternate.status >= 300) throw new FeedAccessBlockedError();
  try {
    await parser.parseString(alternate.body);
  } catch (error) {
    throw new FeedAccessBlockedError(error);
  }
  return alternate;
}
