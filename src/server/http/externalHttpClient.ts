import got from 'got';
import { getFetchUrlCandidates } from '../rss/fetchUrlCandidates';

const client = got.extend({
  retry: { limit: 0 },
  throwHttpErrors: false,
});

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

export async function fetchRssXml(
  url: string,
  options: {
    timeoutMs: number;
    userAgent: string;
    etag?: string | null;
    lastModified?: string | null;
  },
): Promise<FetchRssXmlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

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

    for (const candidate of candidates) {
      try {
        const res = await client(candidate, {
          method: 'GET',
          followRedirect: true,
          headers,
          signal: controller.signal,
          responseType: 'text',
        });

        const status = res.statusCode;
        const etag = typeof res.headers.etag === 'string' ? res.headers.etag : null;
        const lastModified =
          typeof res.headers['last-modified'] === 'string'
            ? res.headers['last-modified']
            : null;
        const urlValue = (res as { url?: unknown }).url;
        const finalUrl =
          typeof urlValue === 'string'
            ? urlValue
            : urlValue instanceof URL
              ? urlValue.toString()
              : candidate;

        if (status === 304) {
          return { status, xml: null, etag, lastModified, finalUrl };
        }

        return { status, xml: res.body, etag, lastModified, finalUrl };
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err;
        lastError = err;
      }
    }

    if (lastError instanceof Error) throw lastError;
    throw new Error('Network error');
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHtml(
  url: string,
  options: {
    timeoutMs: number;
    userAgent: string;
    maxBytes: number;
    headers?: Record<string, string>;
  },
): Promise<FetchHtmlResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const headers: Record<string, string> = {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'user-agent': options.userAgent,
      ...options.headers,
    };

    const req = client.stream(url, {
      method: 'GET',
      followRedirect: true,
      headers,
      signal: controller.signal,
    });

    let status = 0;
    let finalUrl = url;
    let contentType: string | null = null;

    req.on('response', (res) => {
      status = res.statusCode;
      finalUrl = res.url || finalUrl;

      const headerValue = res.headers['content-type'];
      contentType = typeof headerValue === 'string' ? headerValue : headerValue?.[0] ?? null;
    });

    const chunks: Buffer[] = [];
    let received = 0;

    const html = await new Promise<string>((resolve, reject) => {
      req.on('data', (chunk) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

        received += buf.byteLength;
        if (received > options.maxBytes) {
          req.destroy(new Error('Response too large'));
          return;
        }

        chunks.push(buf);
      });

      req.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });

      req.on('error', reject);
    });

    return { status, finalUrl, contentType, html };
  } finally {
    clearTimeout(timeout);
  }
}
