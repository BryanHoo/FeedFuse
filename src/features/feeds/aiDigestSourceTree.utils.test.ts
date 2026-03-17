import { describe, expect, it } from 'vitest';
import type { Feed } from '../../types';
import {
  buildAiDigestSourceTreeData,
  computeVisibleTagCount,
  filterAiDigestSourceTreeData,
  getCategorySelectionState,
  sanitizeSelectedFeedIds,
  toggleCategorySelection,
  toggleFeedSelection,
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

  it('deduplicates selected feed ids and keeps stable order', () => {
    expect(sanitizeSelectedFeedIds(['rss-2', 'rss-1', 'rss-2'])).toEqual(['rss-1', 'rss-2']);
  });

  it('returns category state as checked/indeterminate/unchecked', () => {
    const [category] = buildAiDigestSourceTreeData({
      categories: [{ id: 'cat-tech', name: '科技' }],
      feeds: [
        createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' }),
        createFeed({ id: 'rss-2', kind: 'rss', title: 'RSS 2', categoryId: 'cat-tech' }),
      ],
    });

    expect(category).toBeDefined();
    if (!category) return;

    expect(getCategorySelectionState(category, new Set<string>())).toBe('unchecked');
    expect(getCategorySelectionState(category, new Set<string>(['rss-1']))).toBe('indeterminate');
    expect(getCategorySelectionState(category, new Set<string>(['rss-1', 'rss-2']))).toBe('checked');
  });

  it('toggles whole category selection', () => {
    const [category] = buildAiDigestSourceTreeData({
      categories: [{ id: 'cat-tech', name: '科技' }],
      feeds: [
        createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' }),
        createFeed({ id: 'rss-2', kind: 'rss', title: 'RSS 2', categoryId: 'cat-tech' }),
      ],
    });

    expect(category).toBeDefined();
    if (!category) return;

    expect(toggleCategorySelection([], category, true)).toEqual(['rss-1', 'rss-2']);
    expect(toggleCategorySelection(['rss-1', 'rss-2'], category, false)).toEqual([]);
  });

  it('toggles single feed selection', () => {
    expect(toggleFeedSelection([], 'rss-1', true)).toEqual(['rss-1']);
    expect(toggleFeedSelection(['rss-1', 'rss-2'], 'rss-2', false)).toEqual(['rss-1']);
  });

  it('filters tree by category and feed keyword', () => {
    const tree = buildAiDigestSourceTreeData({
      categories: [
        { id: 'cat-tech', name: '科技' },
        { id: 'cat-design', name: '设计' },
      ],
      feeds: [
        createFeed({ id: 'rss-1', kind: 'rss', title: 'AI 观察', categoryId: 'cat-tech' }),
        createFeed({ id: 'rss-2', kind: 'rss', title: '产品灵感', categoryId: 'cat-design' }),
      ],
    });

    const categoryMatched = filterAiDigestSourceTreeData(tree, '科技');
    expect(categoryMatched).toHaveLength(1);
    expect(categoryMatched[0]?.children).toHaveLength(1);
    expect(categoryMatched[0]?.children[0]?.title).toBe('AI 观察');

    const feedMatched = filterAiDigestSourceTreeData(tree, '产品');
    expect(feedMatched).toHaveLength(1);
    expect(feedMatched[0]?.title).toBe('设计');
    expect(feedMatched[0]?.children).toHaveLength(1);
    expect(feedMatched[0]?.children[0]?.title).toBe('产品灵感');
  });

  it('shows all selected tags when container width is enough', () => {
    expect(
      computeVisibleTagCount({
        selectedCount: 4,
        containerWidth: 760,
        rightSectionWidth: 88,
        tagWidth: 144,
        gap: 6,
        suffixWidth: 28,
      }),
    ).toBe(4);
  });

  it('shows fewer tags and reserves room for +N when container is narrow', () => {
    expect(
      computeVisibleTagCount({
        selectedCount: 4,
        containerWidth: 520,
        rightSectionWidth: 88,
        tagWidth: 144,
        gap: 6,
        suffixWidth: 28,
      }),
    ).toBe(2);
  });
});
