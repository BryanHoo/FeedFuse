export interface HighlightedTextPart {
  text: string;
  matched: boolean;
}

export const GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME =
  'rounded-sm bg-warning/30 px-1 py-px font-semibold text-foreground ring-1 ring-warning/25';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function tokenizeGlobalSearchQuery(query: string): string[] {
  return Array.from(new Set(query.trim().split(/\s+/).filter(Boolean)))
    .sort((left, right) => right.length - left.length)
    .slice(0, 8);
}

function buildHighlightPattern(terms: string[]): RegExp | null {
  if (terms.length === 0) {
    return null;
  }

  return new RegExp(`(${terms.map((term) => escapeRegExp(term)).join('|')})`, 'gi');
}

export function highlightPlainText(value: string, query: string): HighlightedTextPart[] {
  const terms = tokenizeGlobalSearchQuery(query);
  const pattern = buildHighlightPattern(terms);

  if (!pattern || !value) {
    return [{ text: value, matched: false }];
  }

  const parts = value.split(pattern).filter((part) => part.length > 0);

  return parts.map((part) => ({
    text: part,
    matched: terms.some((term) => term.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0),
  }));
}

export function highlightHtmlByQuery(html: string, query: string): string {
  const terms = tokenizeGlobalSearchQuery(query);
  const pattern = buildHighlightPattern(terms);

  if (!pattern || !html || typeof DOMParser !== 'function') {
    return html;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) {
      continue;
    }

    const parentElement = node.parentElement;
    const parentTagName = parentElement?.tagName ?? '';
    if (!node.nodeValue?.trim()) {
      continue;
    }
    if (parentElement?.closest('mark[data-search-highlight="true"]')) {
      continue;
    }
    if (['MARK', 'SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parentTagName)) {
      continue;
    }

    textNodes.push(node);
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue ?? '';
    if (!pattern.test(value)) {
      pattern.lastIndex = 0;
      continue;
    }
    pattern.lastIndex = 0;

    const fragment = doc.createDocumentFragment();
    const parts = value.split(pattern).filter((part) => part.length > 0);

    for (const part of parts) {
      const matched = terms.some(
        (term) => term.localeCompare(part, undefined, { sensitivity: 'accent' }) === 0,
      );
      if (!matched) {
        fragment.appendChild(doc.createTextNode(part));
        continue;
      }

      const mark = doc.createElement('mark');
      mark.setAttribute('data-search-highlight', 'true');
      mark.className = GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME;
      mark.textContent = part;
      fragment.appendChild(mark);
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }

  return doc.body.innerHTML;
}
