import { fetchHtml, fetchImageStream } from '../http/externalHttpClient';

const FAVICON_USER_AGENT = 'FeedFuse Favicon Fetcher/1.0';
const HTML_FETCH_TIMEOUT_MS = 10_000;
const HTML_FETCH_MAX_BYTES = 256 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10_000;
const IMAGE_FETCH_MAX_BYTES = 1024 * 1024;
const IMAGE_FETCH_MAX_REDIRECTS = 3;

const LINK_TAG_REGEX = /<link\b[^>]*>/gi;
const ATTRIBUTE_REGEX = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gi;

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

export interface DiscoveredFeedFavicon {
  sourceUrl: string;
  contentType: string;
  body: Buffer;
  etag: string | null;
  lastModified: string | null;
}

function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, decimal, hex, named) => {
    if (decimal) {
      return String.fromCodePoint(Number.parseInt(decimal, 10));
    }

    if (hex) {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }

    return HTML_ENTITY_MAP[named.toLowerCase()] ?? match;
  });
}

function extractLinkAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};

  for (const match of tag.matchAll(ATTRIBUTE_REGEX)) {
    const key = match[1]?.toLowerCase();
    if (!key || attributes[key]) {
      continue;
    }

    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attributes[key] = decodeHtmlAttribute(value.trim());
  }

  return attributes;
}

function isIconLink(rel: string | undefined): boolean {
  if (!rel) return false;

  return rel
    .toLowerCase()
    .split(/\s+/)
    .some((token) => token === 'icon' || token.endsWith('icon'));
}

export function extractFeedFaviconCandidates(html: string, baseUrl: string): string[] {
  const candidates: string[] = [];

  for (const tag of html.match(LINK_TAG_REGEX) ?? []) {
    const attrs = extractLinkAttributes(tag);
    if (!isIconLink(attrs.rel)) {
      continue;
    }

    const href = attrs.href?.trim();
    if (!href) {
      continue;
    }

    try {
      candidates.push(new URL(href, baseUrl).toString());
    } catch {
      continue;
    }
  }

  return candidates;
}

function buildFallbackFaviconUrl(siteUrl: string): string | null {
  try {
    const normalized = new URL(siteUrl);
    return new URL('/favicon.ico', normalized.origin).toString();
  } catch {
    return null;
  }
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const url of urls) {
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    deduped.push(url);
  }

  return deduped;
}

async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  let received = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    const chunk = Buffer.from(value);
    received += chunk.byteLength;
    if (received > maxBytes) {
      throw new Error('Favicon response too large');
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function discoverFeedFavicon(siteUrl: string): Promise<DiscoveredFeedFavicon | null> {
  let candidateBaseUrl = siteUrl;
  let htmlCandidates: string[] = [];

  try {
    const htmlResult = await fetchHtml(siteUrl, {
      timeoutMs: HTML_FETCH_TIMEOUT_MS,
      userAgent: FAVICON_USER_AGENT,
      maxBytes: HTML_FETCH_MAX_BYTES,
    });

    if (htmlResult.status >= 200 && htmlResult.status < 300) {
      candidateBaseUrl = htmlResult.finalUrl;
      htmlCandidates = extractFeedFaviconCandidates(htmlResult.html, htmlResult.finalUrl);
    }
  } catch {
    // Favicon fallback still works when the homepage HTML is unavailable.
  }

  const fallbackUrl = buildFallbackFaviconUrl(candidateBaseUrl);
  const candidates = dedupeUrls(
    fallbackUrl ? [...htmlCandidates, fallbackUrl] : htmlCandidates,
  );

  for (const candidate of candidates) {
    const result = await fetchImageStream(candidate, {
      maxRedirects: IMAGE_FETCH_MAX_REDIRECTS,
      timeoutMs: IMAGE_FETCH_TIMEOUT_MS,
      userAgent: FAVICON_USER_AGENT,
    });

    if (result.kind !== 'ok') {
      continue;
    }

    if (result.status < 200 || result.status >= 300) {
      continue;
    }

    const contentType = result.contentType?.split(';', 1)[0]?.trim() ?? null;
    if (!contentType?.toLowerCase().startsWith('image/')) {
      continue;
    }

    try {
      const body = await readStreamToBuffer(result.body, IMAGE_FETCH_MAX_BYTES);
      return {
        sourceUrl: candidate,
        contentType,
        body,
        etag: result.etag,
        lastModified: result.lastModified,
      };
    } catch {
      continue;
    }
  }

  return null;
}
