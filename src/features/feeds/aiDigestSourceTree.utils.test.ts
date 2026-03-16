import { describe, expect, it } from 'vitest';
import type { Feed } from '../../types';
import {
  buildAiDigestSourceTreeData,
  collectSelectedFeedIds,
  computeVisibleTagCount,
} from './aiDigestSourceTree.utils';

function createFeed(input: Pick<Feed, 'id' | 'kind' | 'title'> & { categoryId?: string | null }): Feed {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    url: 'https://example.com/feed.xml',
    siteUrl: null,
    icon: undefined,
    unreadCount: 0,
    enabled: true,
    fullTextOnOpenEnabled: false,
    aiSummaryOnOpenEnabled: false,
    aiSummaryOnFetchEnabled: false,
    bodyTranslateOnFetchEnabled: false,
    bodyTranslateOnOpenEnabled: false,
    titleTranslateEnabled: false,
    bodyTranslateEnabled: false,
    articleListDisplayMode: 'card',
    categoryId: input.categoryId ?? null,
    category: null,
    fetchStatus: null,
    fetchError: null,
  };
}

describe('aiDigestSourceTree.utils', () => {
  it('filters ai_digest feeds and hides empty categories', () => {
    const result = buildAiDigestSourceTreeData({
      categories: [
        { id: 'cat-tech', name: '科技' },
        { id: 'cat-empty', name: '空分类' },
      ],
      feeds: [
        createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' }),
        createFeed({ id: 'digest-1', kind: 'ai_digest', title: 'Digest', categoryId: 'cat-tech' }),
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
