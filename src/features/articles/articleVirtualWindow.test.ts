import { describe, expect, it } from 'vitest';
import {
  getArticleVirtualAnchorCompensation,
  getArticleVirtualWindow,
} from './articleVirtualWindow';

describe('getArticleVirtualWindow', () => {
  it('computes visible range with overscan and spacer heights', () => {
    expect(
      getArticleVirtualWindow({
        rowHeights: [32, 88, 88, 88],
        scrollTop: 80,
        viewportHeight: 120,
        overscan: 1,
      }),
    ).toEqual({
      startIndex: 0,
      endIndex: 3,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    });
  });
});

describe('getArticleVirtualAnchorCompensation', () => {
  it('keeps the same anchor row offset after prepending rows', () => {
    expect(
      getArticleVirtualAnchorCompensation({
        previousRows: [
          { key: 'section-1', height: 32 },
          { key: 'article-1', height: 88 },
          { key: 'article-2', height: 88 },
        ],
        nextRows: [
          { key: 'section-0', height: 32 },
          { key: 'article-0', height: 88 },
          { key: 'section-1', height: 32 },
          { key: 'article-1', height: 88 },
          { key: 'article-2', height: 88 },
        ],
        previousScrollTop: 70,
      }),
    ).toBe(190);
  });
});
