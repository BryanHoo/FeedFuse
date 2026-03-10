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

