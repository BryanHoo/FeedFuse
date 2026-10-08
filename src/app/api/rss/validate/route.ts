import { requireApiSession } from '@/server/domains/auth/services/session';
import Parser from 'rss-parser';
import { ok } from '@/server/infra/http/apiResponse';
import { fetchRssXml } from '@/server/infra/http/externalHttpClient';
import { isFeedAccessBlockedError } from '@/server/integrations/rss/feedAccessError';
import {
  formatExternalUrlSafetyMessage,
  getExternalUrlSafety,
  isSafeExternalUrl,
} from '@/server/integrations/rss/ssrfGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RssValidationErrorCode =
  | 'invalid_url'
  | 'unsafe_url'
  | 'unauthorized'
  | 'access_blocked'
  | 'timeout'
  | 'not_feed'
  | 'dns_error'
  | 'network_error';

type RssValidationResultData =
  | {
      valid: true;
      kind: 'rss' | 'atom';
      title?: string;
      siteUrl?: string;
    }
  | {
      valid: false;
      reason: RssValidationErrorCode;
      message: string;
    };

const parser = new Parser();
const feedUrlSafetyOptions = { allowUnresolvedHostname: true } as const;

function detectKind(xml: string): 'rss' | 'atom' {
  const head = xml.trimStart().slice(0, 2000).toLowerCase();
  if (head.includes('<feed')) return 'atom';
  return 'rss';
}

function toJson(result: RssValidationResultData) {
  return ok(result);
}

function isDnsResolutionError(err: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = err;

  while (typeof current === 'object' && current !== null && !visited.has(current)) {
    visited.add(current);

    const code = (current as { code?: unknown }).code;
    if (
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      code === 'EAI_FAIL' ||
      code === 'EAI_NONAME'
    ) {
      return true;
    }

    const message = (current as { message?: unknown }).message;
    if (
      typeof message === 'string' &&
      /(?:getaddrinfo|dns).*(?:enotfound|eai_again|eai_fail|eai_noname)|(?:enotfound|eai_again|eai_fail|eai_noname)/i.test(
        message,
      )
    ) {
      return true;
    }

    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  const urlParam = new URL(request.url).searchParams.get('url') ?? '';

  let url: URL;
  try {
    url = new URL(urlParam);
  } catch {
    return toJson({ valid: false, reason: 'invalid_url', message: '链接格式不正确' });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return toJson({
      valid: false,
      reason: 'invalid_url',
      message: '链接必须使用 http 或 https',
    });
  }

  const normalizedUrl = url.toString();

  const initialSafety = await getExternalUrlSafety(normalizedUrl, feedUrlSafetyOptions);
  if (!initialSafety.safe) {
    return toJson({
      valid: false,
      reason: 'unsafe_url',
      message: formatExternalUrlSafetyMessage(initialSafety, 'source'),
    });
  }

  try {
    const res = await fetchRssXml(normalizedUrl, {
      timeoutMs: 10_000,
      userAgent: 'FeedFuse RSS Validator',
      isSafeUrl: (value) => isSafeExternalUrl(value, feedUrlSafetyOptions),
    });

    // 跟随重定向后需要再次校验最终地址，避免绕过 RSS 网络访问限制。
    const finalSafety = await getExternalUrlSafety(res.finalUrl, feedUrlSafetyOptions);
    if (!finalSafety.safe) {
      return toJson({
        valid: false,
        reason: 'unsafe_url',
        message: formatExternalUrlSafetyMessage(finalSafety, 'redirect'),
      });
    }

    if (res.status === 401 || res.status === 403) {
      return toJson({
        valid: false,
        reason: 'unauthorized',
        message: '源站需要授权访问',
      });
    }

    if (res.status < 200 || res.status >= 300) {
      return toJson({
        valid: false,
        reason: 'network_error',
        message: '校验失败，请稍后重试',
      });
    }

    if (!res.xml) {
      return toJson({
        valid: false,
        reason: 'not_feed',
        message: '响应不是合法的 RSS/Atom 源',
      });
    }

    const xml = res.xml;
    const kind = detectKind(xml);

    try {
      const feed = await parser.parseString(xml);
      const parsedSiteUrl = normalizeHttpUrl(feed.link);
      return toJson({
        valid: true,
        kind,
        title: typeof feed.title === 'string' ? feed.title : undefined,
        siteUrl: parsedSiteUrl ?? undefined,
      });
    } catch {
      return toJson({
        valid: false,
        reason: 'not_feed',
        message: '响应不是合法的 RSS/Atom 源',
      });
    }
  } catch (err) {
    if (isFeedAccessBlockedError(err)) {
      return toJson({ valid: false, reason: 'access_blocked', message: err.message });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      return toJson({
        valid: false,
        reason: 'timeout',
        message: '校验超时，请稍后重试',
      });
    }
    if (isDnsResolutionError(err)) {
      return toJson({
        valid: false,
        reason: 'dns_error',
        message: '域名无法解析，请检查网络或 DNS 设置',
      });
    }
    return toJson({
      valid: false,
      reason: 'network_error',
      message: '校验失败，请稍后重试',
    });
  }
}
