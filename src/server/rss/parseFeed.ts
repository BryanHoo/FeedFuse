import Parser from 'rss-parser';

export interface ParsedFeedItem {
  title: string;
  link: string | null;
  guid: string | null;
  author: string | null;
  publishedAt: Date;
  contentHtml: string | null;
  previewImage: string | null;
  summary: string | null;
}

export interface ParsedFeed {
  title: string | null;
  link: string | null;
  language: string | null;
  items: ParsedFeedItem[];
}

const parser = new Parser({
  customFields: {
    feed: ['language'],
    item: [
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      ['media:content', 'mediaContent', { keepArray: true }],
      ['itunes:image', 'itunesImage', { keepArray: true }],
      ['link', 'links', { keepArray: true }],
    ],
  },
});

function normalizeHttpUrl(value: unknown, baseUrl: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;

  try {
    const url = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function looksLikeImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp|svg)(?:$|[?#])/i.test(url);
}

function getXmlAttrs(node: unknown): Record<string, unknown> | null {
  if (typeof node !== 'object' || node === null) return null;
  const attrs = (node as { $?: unknown }).$;
  if (typeof attrs !== 'object' || attrs === null) return null;
  return attrs as Record<string, unknown>;
}

function getXmlAttr(node: unknown, name: string): string | null {
  const attrs = getXmlAttrs(node);
  const raw = attrs?.[name];
  return typeof raw === 'string' ? raw : null;
}

function getStringField(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const raw = record[key];
  return typeof raw === 'string' ? raw : null;
}

function firstNormalizedUrlFromNodes(
  nodes: unknown,
  input: { baseUrl: string | null; urlAttr: 'url' | 'href'; requireImageType?: boolean },
): string | null {
  const arr = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of arr) {
    const rawUrl = getXmlAttr(node, input.urlAttr);
    if (!rawUrl) continue;

    const normalized = normalizeHttpUrl(rawUrl, input.baseUrl);
    if (!normalized) continue;

    if (!input.requireImageType) return normalized;

    const type = (getXmlAttr(node, 'type') ?? '').toLowerCase();
    const medium = (getXmlAttr(node, 'medium') ?? '').toLowerCase();

    if (type.startsWith('image/')) return normalized;
    if (medium === 'image') return normalized;
    if (looksLikeImageUrl(normalized)) return normalized;
  }

  return null;
}

function extractPreviewImage(item: unknown, baseUrl: string | null): string | null {
  if (typeof item !== 'object' || item === null) return null;

  const mediaThumbnail = (item as { mediaThumbnail?: unknown }).mediaThumbnail;
  const fromMediaThumbnail = firstNormalizedUrlFromNodes(mediaThumbnail, {
    baseUrl,
    urlAttr: 'url',
  });
  if (fromMediaThumbnail) return fromMediaThumbnail;

  const mediaContent = (item as { mediaContent?: unknown }).mediaContent;
  const fromMediaContent = firstNormalizedUrlFromNodes(mediaContent, {
    baseUrl,
    urlAttr: 'url',
    requireImageType: true,
  });
  if (fromMediaContent) return fromMediaContent;

  const enclosure = (item as { enclosure?: unknown }).enclosure as
    | { url?: unknown; type?: unknown }
    | undefined;

  const enclosureUrl = normalizeHttpUrl(enclosure?.url, baseUrl);
  if (!enclosureUrl) return null;

  const type = typeof enclosure?.type === 'string' ? enclosure.type.toLowerCase() : '';
  if (type.startsWith('image/')) return enclosureUrl;
  if (!type && looksLikeImageUrl(enclosureUrl)) return enclosureUrl;

  const itunesImage = (item as { itunesImage?: unknown }).itunesImage;
  const fromItunesImage = firstNormalizedUrlFromNodes(itunesImage, {
    baseUrl,
    urlAttr: 'href',
  });
  if (fromItunesImage) return fromItunesImage;

  const links = (item as { links?: unknown }).links;
  if (Array.isArray(links)) {
    for (const link of links) {
      const rel = (getXmlAttr(link, 'rel') ?? '').toLowerCase();
      if (rel !== 'enclosure') continue;

      const href = getXmlAttr(link, 'href');
      const normalized = normalizeHttpUrl(href, baseUrl);
      if (!normalized) continue;

      const typeAttr = (getXmlAttr(link, 'type') ?? '').toLowerCase();
      if (typeAttr.startsWith('image/')) return normalized;
      if (!typeAttr && looksLikeImageUrl(normalized)) return normalized;
    }
  }

  return null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export async function parseFeed(xml: string, fetchedAt: Date): Promise<ParsedFeed> {
  const feed = await parser.parseString(xml);

  const title = typeof feed.title === 'string' ? feed.title : null;
  const link = typeof feed.link === 'string' ? feed.link : null;
  const language = typeof feed.language === 'string' ? feed.language : null;

  const items: ParsedFeedItem[] = (feed.items ?? []).map((item) => {
    const baseUrl =
      typeof item.link === 'string'
        ? item.link
        : link;

    const publishedAt =
      parseDate(item.isoDate) ??
      parseDate(item.pubDate) ??
      fetchedAt;

    const contentHtml =
      typeof item.content === 'string'
        ? item.content
        : getStringField(item, 'content:encoded');

    const summary =
      typeof item.contentSnippet === 'string'
        ? item.contentSnippet
        : typeof item.summary === 'string'
          ? item.summary
          : null;

    const author =
      typeof item.creator === 'string'
        ? item.creator
        : getStringField(item, 'author');

    const previewImage = extractPreviewImage(item, baseUrl);

    return {
      title: typeof item.title === 'string' ? item.title : '',
      link: typeof item.link === 'string' ? item.link : null,
      guid: typeof item.guid === 'string' ? item.guid : null,
      author,
      publishedAt,
      contentHtml,
      previewImage,
      summary,
    };
  });

  return { title, link, language, items };
}
