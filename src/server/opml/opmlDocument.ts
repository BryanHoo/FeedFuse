import { JSDOM } from 'jsdom';

export interface ParsedOpmlEntry {
  title: string;
  xmlUrl: string;
  siteUrl: string | null;
  category: string | null;
}

export interface ParsedOpmlInvalidItem {
  title: string | null;
  xmlUrl: string | null;
  reason: 'missing_xml_url' | 'invalid_url';
}

export interface ParsedOpmlDuplicateItem {
  title: string;
  xmlUrl: string;
  reason: 'duplicate_in_file';
}

export interface ParsedOpmlDocument {
  entries: ParsedOpmlEntry[];
  invalidItems: ParsedOpmlInvalidItem[];
  duplicateItems: ParsedOpmlDuplicateItem[];
}

export class OpmlDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpmlDocumentError';
  }
}

interface BuildOpmlDocumentInput {
  title: string;
  categories: Array<{ id: string; name: string; position: number }>;
  feeds: Array<{
    id: string;
    title: string;
    url: string;
    siteUrl: string | null;
    categoryId: string | null;
  }>;
}

function getAttributeValue(element: Element, name: string): string | null {
  const rawValue = element.getAttribute(name);
  if (typeof rawValue !== 'string') {
    return null;
  }

  const trimmedValue = rawValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getOutlineLabel(element: Element): string | null {
  return getAttributeValue(element, 'text') ?? getAttributeValue(element, 'title');
}

function getChildOutlines(element: Element): Element[] {
  return Array.from(element.children).filter((child) => child.tagName === 'outline');
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function looksLikeFeedWithoutXmlUrl(element: Element): boolean {
  if (element.hasAttribute('xmlUrl')) {
    return getAttributeValue(element, 'xmlUrl') === null;
  }

  const typeValue = getAttributeValue(element, 'type')?.toLowerCase();
  return typeValue === 'rss' || typeValue === 'atom';
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildFeedOutline(feed: BuildOpmlDocumentInput['feeds'][number], indent: string): string {
  const attributes = [
    `text="${escapeXml(feed.title || feed.url)}"`,
    `title="${escapeXml(feed.title || feed.url)}"`,
    'type="rss"',
    `xmlUrl="${escapeXml(feed.url)}"`,
  ];

  const normalizedSiteUrl =
    typeof feed.siteUrl === 'string' && feed.siteUrl.trim().length > 0
      ? normalizeHttpUrl(feed.siteUrl)
      : null;
  if (normalizedSiteUrl) {
    attributes.push(`htmlUrl="${escapeXml(normalizedSiteUrl)}"`);
  }

  return `${indent}<outline ${attributes.join(' ')} />`;
}

export function parseOpmlDocument(xml: string): ParsedOpmlDocument {
  let dom: JSDOM;
  const normalizedXml = xml.trim();

  try {
    dom = new JSDOM(normalizedXml, { contentType: 'text/xml' });
  } catch {
    throw new OpmlDocumentError('Invalid OPML XML');
  }

  const root = dom.window.document.documentElement;
  if (!root || root.tagName !== 'opml') {
    throw new OpmlDocumentError('Invalid OPML root');
  }

  const body = Array.from(root.children).find((child) => child.tagName === 'body');
  if (!body) {
    throw new OpmlDocumentError('Missing OPML body');
  }

  const entries: ParsedOpmlEntry[] = [];
  const invalidItems: ParsedOpmlInvalidItem[] = [];
  const duplicateItems: ParsedOpmlDuplicateItem[] = [];
  const seenUrls = new Set<string>();

  const visitOutline = (outline: Element, nearestCategory: string | null) => {
    const xmlUrl = getAttributeValue(outline, 'xmlUrl');
    const htmlUrl = getAttributeValue(outline, 'htmlUrl');
    const label = getOutlineLabel(outline);

    if (xmlUrl) {
      const normalizedUrl = normalizeHttpUrl(xmlUrl);
      const normalizedSiteUrl = htmlUrl ? normalizeHttpUrl(htmlUrl) : null;
      if (!normalizedUrl) {
        invalidItems.push({
          title: label,
          xmlUrl,
          reason: 'invalid_url',
        });
      } else if (seenUrls.has(normalizedUrl)) {
        duplicateItems.push({
          title: label ?? normalizedUrl,
          xmlUrl: normalizedUrl,
          reason: 'duplicate_in_file',
        });
      } else {
        seenUrls.add(normalizedUrl);
        entries.push({
          title: label ?? normalizedUrl,
          xmlUrl: normalizedUrl,
          siteUrl: normalizedSiteUrl,
          category: nearestCategory,
        });
      }

      return;
    }

    if (looksLikeFeedWithoutXmlUrl(outline)) {
      invalidItems.push({
        title: label,
        xmlUrl: null,
        reason: 'missing_xml_url',
      });
      return;
    }

    const nextCategory = label ?? nearestCategory;
    for (const child of getChildOutlines(outline)) {
      visitOutline(child, nextCategory);
    }
  };

  for (const outline of getChildOutlines(body)) {
    visitOutline(outline, null);
  }

  return {
    entries,
    invalidItems,
    duplicateItems,
  };
}

export function buildOpmlDocument(input: BuildOpmlDocumentInput): string {
  const sortedCategories = [...input.categories].sort(
    (left, right) => left.position - right.position || left.name.localeCompare(right.name),
  );
  const feedsByCategoryId = new Map<string, BuildOpmlDocumentInput['feeds']>();
  for (const feed of input.feeds) {
    if (!feed.categoryId) {
      continue;
    }

    const currentFeeds = feedsByCategoryId.get(feed.categoryId) ?? [];
    currentFeeds.push(feed);
    feedsByCategoryId.set(feed.categoryId, currentFeeds);
  }

  const bodyLines = sortedCategories.flatMap((category) => {
    const categoryFeeds = feedsByCategoryId.get(category.id) ?? [];
    if (categoryFeeds.length === 0) {
      return [];
    }

    return [
      `    <outline text="${escapeXml(category.name)}" title="${escapeXml(category.name)}">`,
      ...categoryFeeds.map((feed) => buildFeedOutline(feed, '      ')),
      '    </outline>',
    ];
  });

  const uncategorizedFeeds = input.feeds.filter((feed) => feed.categoryId === null);
  bodyLines.push(...uncategorizedFeeds.map((feed) => buildFeedOutline(feed, '    ')));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(input.title)}</title>`,
    '  </head>',
    '  <body>',
    ...bodyLines,
    '  </body>',
    '</opml>',
  ].join('\n');
}
