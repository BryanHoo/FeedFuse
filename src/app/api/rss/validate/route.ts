import Parser from 'rss-parser';
import { ok } from '../../../../server/http/apiResponse';
import { getFetchUrlCandidates } from '../../../../server/rss/fetchUrlCandidates';
import { isSafeExternalUrl } from '../../../../server/rss/ssrfGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RssValidationErrorCode =
  | 'invalid_url'
  | 'unauthorized'
  | 'timeout'
  | 'not_feed'
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

function detectKind(xml: string): 'rss' | 'atom' {
  const head = xml.trimStart().slice(0, 2000).toLowerCase();
  if (head.includes('<feed')) return 'atom';
  return 'rss';
}

function toJson(result: RssValidationResultData) {
  return ok(result);
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

  if (!(await isSafeExternalUrl(urlParam))) {
    return toJson({ valid: false, reason: 'invalid_url', message: '链接格式不正确' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const candidates = getFetchUrlCandidates(urlParam);
    let res: Response | null = null;
    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        res = await fetch(candidate, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            accept:
              'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
          signal: controller.signal,
        });
        break;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        lastError = err;
      }
    }

    if (!res) {
      if (lastError instanceof Error) throw lastError;
      throw new Error('Network error');
    }

    if (res.status === 401 || res.status === 403) {
      return toJson({
        valid: false,
        reason: 'unauthorized',
        message: '源站需要授权访问',
      });
    }

    if (!res.ok) {
      return toJson({
        valid: false,
        reason: 'network_error',
        message: '校验失败，请稍后重试',
      });
    }

    const xml = await res.text();
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
    if (err instanceof Error && err.name === 'AbortError') {
      return toJson({
        valid: false,
        reason: 'timeout',
        message: '校验超时，请稍后重试',
      });
    }
    return toJson({
      valid: false,
      reason: 'network_error',
      message: '校验失败，请稍后重试',
    });
  } finally {
    clearTimeout(timeout);
  }
}
