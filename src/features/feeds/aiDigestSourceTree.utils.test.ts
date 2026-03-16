import { describe, expect, it } from 'vitest';
import {
  buildAiDigestSourceTreeData,
  collectSelectedFeedIds,
  computeVisibleTagCount,
} from './aiDigestSourceTree.utils';

describe('aiDigestSourceTree.utils', () => {
  it('filters ai_digest feeds and hides empty categories', () => {
    const result = buildAiDigestSourceTreeData({
      categories: [
        { id: 'cat-tech', name: '科技' },
        { id: 'cat-empty', name: '空分类' },
      ],
      feeds: [
        {
          id: 'rss-1',
          kind: 'rss',
          title: 'RSS 1',
          categoryId: 'cat-tech',
        } as any,
        {
          id: 'digest-1',
          kind: 'ai_digest',
          title: 'Digest',
          categoryId: 'cat-tech',
        } as any,
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('category:cat-tech');
    expect(result[0]?.children?.map((node) => node.value)).toEqual(['feed:rss-1']);
  });

  it('collects feed ids only and deduplicates stably', () => {
    expect(
      collectSelectedFeedIds([
        'category:cat-tech',
        'feed:rss-2',
        'feed:rss-2',
        'feed:rss-1',
      ]),
    ).toEqual(['rss-1', 'rss-2']);
  });

  it('computes single-line visible tag count', () => {
    expect(
      computeVisibleTagCount({
        containerWidth: 360,
        tagWidth: 112,
        gap: 8,
        suffixWidth: 56,
      }),
    ).toBeGreaterThanOrEqual(1);
  });
});
