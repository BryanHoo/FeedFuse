import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME,
  highlightHtmlByQuery,
  highlightPlainText,
  tokenizeGlobalSearchQuery,
} from './globalSearch';

describe('globalSearch utilities', () => {
  it('tokenizes query by whitespace and removes duplicates', () => {
    expect(tokenizeGlobalSearchQuery('  FeedFuse  search FeedFuse  ')).toEqual([
      'FeedFuse',
      'search',
    ]);
  });

  it('highlights plain text by query tokens', () => {
    expect(highlightPlainText('FeedFuse search result', 'FeedFuse result')).toEqual([
      { text: 'FeedFuse', matched: true },
      { text: ' search ', matched: false },
      { text: 'result', matched: true },
    ]);
  });

  it('highlights text nodes inside html without breaking element structure', () => {
    const html = '<p>Hello <strong>FeedFuse</strong> world</p>';
    const highlighted = highlightHtmlByQuery(html, 'FeedFuse world');

    expect(highlighted).toContain('<strong><mark');
    expect(highlighted).toContain('FeedFuse</mark></strong>');
    expect(highlighted).toContain('<mark');
    expect(highlighted).toContain('world</mark>');
    expect(highlighted).toContain('<p>');
    expect(highlighted).toContain(GLOBAL_SEARCH_HIGHLIGHT_CLASS_NAME);
  });
});
