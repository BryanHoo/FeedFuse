function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function stripHtmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export function resolveArticleBriefContent(input: {
  summary?: string | null;
  contentHtml?: string | null;
}): string {
  const summary = normalizeWhitespace(input.summary ?? '');
  if (summary) {
    return summary;
  }

  return stripHtmlToText(input.contentHtml ?? '');
}
