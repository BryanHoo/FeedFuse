import { externalHttpTransport as client } from './externalHttpTransport';
import { fetchTextWithValidatedRedirects, isTerminalFetchError, type SafeUrlChecker } from './fetchExternalText';
import { fetchRssTextWithRecovery } from '@/server/integrations/rss/feedAccessRecovery';
import { isFeedAccessBlockedError } from '@/server/integrations/rss/feedAccessError';
import { Readable } from 'node:stream';
import { getPool } from '@/server/infra/db/pool';
import { writeSystemLog } from '@/server/infra/logging/systemLogger';
import { getFetchUrlCandidates } from '@/server/integrations/rss/fetchUrlCandidates';
import { isSafeMediaUrl } from '@/server/integrations/media/mediaProxyGuard';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';

const DEFAULT_MAX_RSS_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 5;
const LOG_DETAILS_MAX_CHARS = 4096;

export interface FetchRssXmlResult {
  status: number;
  xml: string | null;
  etag: string | null;
  lastModified: string | null;
  finalUrl: string;
}

export interface FetchHtmlResult {
  status: number;
  finalUrl: string;
  contentType: string | null;
  html: string;
}

interface ExternalRequestLogging {
  userId?: string | null;
  source: string;
  requestLabel: string;
  context?: Record<string, unknown>;
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : value?.[0] ?? null;
}

function getExternalErrorDetails(err: unknown): string {
  if (err instanceof Error) {
    return err.message || err.name || 'Unknown error';
  }

  if (typeof err === 'string') {
    return err;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function truncateLogDetails(details: string | null): string | null {
  if (details === null || details.length <= LOG_DETAILS_MAX_CHARS) {
    return details;
  }

  return `${details.slice(0, LOG_DETAILS_MAX_CHARS)}\n...[truncated]`;
}

async function writeExternalRequestLog(input: {
  logging?: ExternalRequestLogging;
  url: string;
  method: 'GET';
  status?: number;
  durationMs: number;
  details: string | null;
}) {
  if (!input.logging) {
    return;
  }

  const isSuccess =
    input.status === 304 ||
    (input.status !== undefined && input.status >= 200 && input.status < 300);

  await writeSystemLog(getPool(), {
    userId: input.logging.userId ?? null,
    level: isSuccess ? 'info' : 'error',
    category: 'external_api',
    source: input.logging.source,
    message: `${input.logging.requestLabel} ${isSuccess ? 'completed' : 'failed'}`,
    details: isSuccess ? null : truncateLogDetails(input.details),
    context: {
      url: input.url,
      method: input.method,
      status: input.status ?? null,
      durationMs: input.durationMs,
      ...input.logging.context,
    },
  });
}

export async function fetchRssXml(
  url: string,
  options: {
    timeoutMs: number;
    userAgent: string;
    etag?: string | null;
    lastModified?: string | null;
    maxBytes?: number;
    maxRedirects?: number;
    isSafeUrl?: SafeUrlChecker;
    logging?: ExternalRequestLogging;
  },
): Promise<FetchRssXmlResult> {
  const startedAt = Date.now();

  try {
    const headers: Record<string, string> = {
      accept:
        'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      'user-agent': options.userAgent,
    };

    if (options.etag) headers['if-none-match'] = options.etag;
    if (options.lastModified) headers['if-modified-since'] = options.lastModified;

    const candidates = getFetchUrlCandidates(url);
    let lastError: unknown = null;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_RSS_BYTES;
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const isSafeUrl = options.isSafeUrl ?? isSafeExternalUrl;

    for (const candidate of candidates) {
      try {
        const hop = await fetchRssTextWithRecovery(candidate, {
          timeoutMs: options.timeoutMs,
          headers,
          maxBytes,
          maxRedirects,
          isSafeUrl,
        });
        const status = hop.status;
        const etag = typeof hop.headers.etag === 'string' ? hop.headers.etag : null;
        const lastModified =
          typeof hop.headers['last-modified'] === 'string'
            ? hop.headers['last-modified']
            : null;
        const finalUrl = hop.finalUrl;

        if (status === 304) {
          await writeExternalRequestLog({
            logging: options.logging,
            url: finalUrl,
            method: 'GET',
            status,
            details: null,
            durationMs: Date.now() - startedAt,
          });
          return { status, xml: null, etag, lastModified, finalUrl };
        }

        await writeExternalRequestLog({
          logging: options.logging,
          url: finalUrl,
          method: 'GET',
          status,
          details: hop.body,
          durationMs: Date.now() - startedAt,
        });
        return { status, xml: hop.body, etag, lastModified, finalUrl };
      } catch (err) {
        // 只有网络失败才尝试 Docker fallback，安全和响应限制错误必须保留原始结论。
        if (isTerminalFetchError(err) || isFeedAccessBlockedError(err)) throw err;
        lastError = err;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error('Network error');
  } catch (err) {
    await writeExternalRequestLog({
      logging: options.logging,
      url,
      method: 'GET',
      details: getExternalErrorDetails(err),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export async function fetchHtml(
  url: string,
  options: {
    timeoutMs: number;
    userAgent: string;
    maxBytes: number;
    maxRedirects?: number;
    isSafeUrl?: SafeUrlChecker;
    headers?: Record<string, string>;
    logging?: ExternalRequestLogging;
  },
): Promise<FetchHtmlResult> {
  const startedAt = Date.now();

  try {
    const headers: Record<string, string> = {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': options.userAgent,
      ...options.headers,
    };
    const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const isSafeUrl = options.isSafeUrl ?? isSafeExternalUrl;
    const hop = await fetchTextWithValidatedRedirects(url, {
      timeoutMs: options.timeoutMs,
      headers,
      maxBytes: options.maxBytes,
      maxRedirects,
      isSafeUrl,
    });

    await writeExternalRequestLog({
      logging: options.logging,
      url: hop.finalUrl,
      method: 'GET',
      status: hop.status,
      details: hop.body,
      durationMs: Date.now() - startedAt,
    });
    return {
      status: hop.status,
      finalUrl: hop.finalUrl,
      contentType: hop.contentType,
      html: hop.body,
    };
  } catch (err) {
    await writeExternalRequestLog({
      logging: options.logging,
      url,
      method: 'GET',
      details: getExternalErrorDetails(err),
      durationMs: Date.now() - startedAt,
    });
    throw err;
  }
}

export type FetchImageStreamResult =
  | FetchImageStreamOkResult
  | { kind: 'forbidden' }
  | { kind: 'too_many_redirects' }
  | { kind: 'bad_gateway' }
  | { kind: 'unsupported_media_type' };

type FetchImageStreamOkResult = {
  kind: 'ok';
  status: number;
  contentType: string | null;
  cacheControl: string;
  contentEncoding: string | null;
  contentLength: string | null;
  etag: string | null;
  lastModified: string | null;
  body: ReadableStream<Uint8Array>;
};

type FetchImageStreamHopResult =
  | { kind: 'redirect'; nextUrl: string }
  | FetchImageStreamOkResult
  | { kind: 'bad_gateway' }
  | { kind: 'unsupported_media_type' };

function isImageContentType(contentType: string | null): boolean {
  return contentType?.toLowerCase().startsWith('image/') ?? false;
}

function buildFetchImageStreamOkResult(input: {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: ReadableStream<Uint8Array>;
}): FetchImageStreamOkResult {
  return {
    kind: 'ok',
    status: input.status,
    contentType: getHeaderValue(input.headers['content-type']),
    cacheControl: getHeaderValue(input.headers['cache-control']) ?? 'public, max-age=3600',
    contentEncoding: getHeaderValue(input.headers['content-encoding']),
    contentLength: getHeaderValue(input.headers['content-length']),
    etag: getHeaderValue(input.headers.etag),
    lastModified: getHeaderValue(input.headers['last-modified']),
    body: input.body,
  };
}

async function fetchImageStreamHop(
  url: string,
  options: { userAgent: string; timeoutMs: number },
): Promise<FetchImageStreamHopResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const sourceUrl = new URL(url);
    const req = client.stream(url, {
      method: 'GET',
      followRedirect: false,
      headers: {
        'user-agent': options.userAgent,
        accept: 'image/*,*/*;q=0.8',
        referer: `${sourceUrl.origin}/`,
      },
      decompress: false,
      signal: controller.signal,
    });

    return await new Promise<FetchImageStreamHopResult>((resolve) => {
      let settled = false;
      const cleanup = () => clearTimeout(timeout);
      const safeResolve = (value: FetchImageStreamHopResult) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      req.on('close', cleanup);
      req.on('error', () => {
        cleanup();
        safeResolve({ kind: 'bad_gateway' });
      });

      req.on('response', (res) => {
        const status = res.statusCode;

        if ([301, 302, 303, 307, 308].includes(status)) {
          const location = getHeaderValue(res.headers.location);
          if (!location) {
            cleanup();
            safeResolve({ kind: 'bad_gateway' });
            req.destroy();
            return;
          }

          const nextUrl = new URL(location, url).toString();
          cleanup();
          safeResolve({ kind: 'redirect', nextUrl });
          req.destroy();
          return;
        }

        const contentType = getHeaderValue(res.headers['content-type']);
        if (status >= 200 && status < 300 && !isImageContentType(contentType)) {
          cleanup();
          safeResolve({ kind: 'unsupported_media_type' });
          req.destroy();
          return;
        }

        safeResolve(buildFetchImageStreamOkResult({
          status,
          headers: res.headers,
          body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
        }));
      });
    });
  } catch {
    clearTimeout(timeout);
    return { kind: 'bad_gateway' };
  }
}

export async function fetchImageStream(
  url: string,
  options: {
    maxRedirects: number;
    userAgent: string;
    timeoutMs?: number;
  },
): Promise<FetchImageStreamResult> {
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    if (!(await isSafeMediaUrl(currentUrl))) {
      return { kind: 'forbidden' };
    }

    const hop = await fetchImageStreamHop(currentUrl, {
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs ?? 10_000,
    });

    if (hop.kind === 'redirect') {
      if (redirects >= options.maxRedirects) {
        return { kind: 'too_many_redirects' };
      }

      redirects += 1;
      currentUrl = hop.nextUrl;
      continue;
    }

    if (hop.kind === 'ok') return hop;
    return hop;
  }
}
