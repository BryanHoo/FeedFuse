import { externalHttpTransport } from './externalHttpTransport';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type SafeUrlChecker = (url: string) => boolean | Promise<boolean>;

export type FetchTextOkResult = {
  kind: 'ok';
  status: number;
  finalUrl: string;
  contentType: string | null;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type FetchTextHopResult = { kind: 'redirect'; nextUrl: string } | FetchTextOkResult;

export interface FetchExternalTextOptions {
  timeoutMs: number;
  headers: Record<string, string>;
  maxBytes: number;
  maxRedirects: number;
  isSafeUrl: SafeUrlChecker;
}

export function isTerminalFetchError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' ||
    ['Unsafe URL', 'Response too large', 'Too many redirects'].includes(error.message);
}

function getHeaderValue(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : value?.[0] ?? null;
}

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.has(status);
}

async function assertSafeUrl(url: string, isSafeUrl: SafeUrlChecker): Promise<void> {
  if (!(await isSafeUrl(url))) {
    throw new Error('Unsafe URL');
  }
}

async function fetchTextHop(
  url: string,
  options: {
    timeoutMs: number;
    headers: Record<string, string>;
    maxBytes: number;
  },
): Promise<FetchTextHopResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const req = externalHttpTransport.stream(url, {
      method: 'GET',
      followRedirect: false,
      headers: options.headers,
      signal: controller.signal,
    });

    return await new Promise<FetchTextHopResult>((resolve, reject) => {
      let settled = false;
      let status = 0;
      let finalUrl = url;
      let contentType: string | null = null;
      let responseHeaders: Record<string, string | string[] | undefined> = {};
      const chunks: Buffer[] = [];
      let received = 0;

      const cleanup = () => clearTimeout(timeout);
      const safeResolve = (value: FetchTextHopResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const safeReject = (err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      req.on('close', cleanup);
      req.on('error', safeReject);

      req.on('response', (res) => {
        status = res.statusCode;
        finalUrl = res.url || finalUrl;
        responseHeaders = res.headers;
        contentType = getHeaderValue(res.headers['content-type']);

        if (!isRedirectStatus(status)) {
          return;
        }

        const location = getHeaderValue(res.headers.location);
        if (!location) {
          safeReject(new Error('Missing redirect location'));
          req.destroy();
          return;
        }

        try {
          // 手动处理重定向，确保下一跳请求发出前能先做 SSRF 校验。
          safeResolve({ kind: 'redirect', nextUrl: new URL(location, url).toString() });
        } catch (err) {
          safeReject(err);
        }
        req.destroy();
      });

      req.on('data', (chunk) => {
        if (settled) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        received += buf.byteLength;
        if (received > options.maxBytes) {
          req.destroy(new Error('Response too large'));
          return;
        }

        chunks.push(buf);
      });

      req.on('end', () => {
        safeResolve({
          kind: 'ok',
          status,
          finalUrl,
          contentType,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextWithValidatedRedirects(
  url: string,
  options: FetchExternalTextOptions,
): Promise<FetchTextOkResult> {
  let currentUrl = url;
  let redirects = 0;

  while (true) {
    await assertSafeUrl(currentUrl, options.isSafeUrl);
    const hop = await fetchTextHop(currentUrl, options);

    if (hop.kind === 'ok') {
      return hop;
    }

    if (redirects >= options.maxRedirects) {
      throw new Error('Too many redirects');
    }

    redirects += 1;
    currentUrl = hop.nextUrl;
  }
}
