import type { Category, Feed } from '../../types';

export type SourceTreeFeedNode = {
  id: string;
  title: string;
  value: string;
  key: string;
};

export type SourceTreeCategoryNode = {
  id: string;
  title: string;
  value: string;
  key: string;
  children: SourceTreeFeedNode[];
};

const UNCATEGORIZED_KEY = 'cat-uncategorized';
const UNCATEGORIZED_LABEL = '未分类';
const FEED_PREFIX = 'feed:';

function getCategoryNodeValue(categoryId: string): string {
  return `category:${categoryId}`;
}

function getFeedNodeValue(feedId: string): string {
  return `${FEED_PREFIX}${feedId}`;
}

function normalizeCategoryId(feed: Feed): string {
  return feed.categoryId ?? UNCATEGORIZED_KEY;
}

export function buildAiDigestSourceTreeData(input: {
  categories: Category[];
  feeds: Feed[];
}): SourceTreeCategoryNode[] {
  const rssFeeds = input.feeds.filter((feed) => feed.kind === 'rss');
  const categoryNameById = new Map(input.categories.map((category) => [category.id, category.name]));

  // 先按分类聚合 RSS，后续可统一隐藏空分类。
  const groupedFeeds = new Map<string, Feed[]>();
  for (const feed of rssFeeds) {
    const categoryId = normalizeCategoryId(feed);
    const currentFeeds = groupedFeeds.get(categoryId) ?? [];
    currentFeeds.push(feed);
    groupedFeeds.set(categoryId, currentFeeds);
  }

  const nodes: SourceTreeCategoryNode[] = [];
  const renderedCategoryIds = new Set<string>();
  for (const category of input.categories) {
    const feeds = groupedFeeds.get(category.id) ?? [];
    if (feeds.length === 0) continue;

    nodes.push({
      id: category.id,
      title: category.name,
      value: getCategoryNodeValue(category.id),
      key: getCategoryNodeValue(category.id),
      children: feeds
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        .map((feed) => ({
          id: feed.id,
          title: feed.title,
          value: getFeedNodeValue(feed.id),
          key: getFeedNodeValue(feed.id),
        })),
    });
    renderedCategoryIds.add(category.id);
  }

  const uncategorizedFeeds = groupedFeeds.get(UNCATEGORIZED_KEY) ?? [];
  if (uncategorizedFeeds.length > 0 && !renderedCategoryIds.has(UNCATEGORIZED_KEY)) {
    nodes.push({
      id: UNCATEGORIZED_KEY,
      title: categoryNameById.get(UNCATEGORIZED_KEY) ?? UNCATEGORIZED_LABEL,
      value: getCategoryNodeValue(UNCATEGORIZED_KEY),
      key: getCategoryNodeValue(UNCATEGORIZED_KEY),
      children: uncategorizedFeeds
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        .map((feed) => ({
          id: feed.id,
          title: feed.title,
          value: getFeedNodeValue(feed.id),
          key: getFeedNodeValue(feed.id),
        })),
    });
  }

  return nodes;
}

export type CategorySelectionState = 'checked' | 'indeterminate' | 'unchecked';

export function sanitizeSelectedFeedIds(feedIds: string[]): string[] {
  return [...new Set(feedIds.filter((feedId) => Boolean(feedId.trim())))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function computeVisibleTagCount(input: {
  selectedCount: number;
  containerWidth: number;
  rightSectionWidth: number;
  tagWidth: number;
  gap: number;
  suffixWidth: number;
}): number {
  const selectedCount = Math.max(0, input.selectedCount);
  if (selectedCount <= 0) {
    return 0;
  }

  const containerWidth = Math.max(0, input.containerWidth);
  const rightSectionWidth = Math.max(0, input.rightSectionWidth);
  const tagWidth = Math.max(1, input.tagWidth);
  const gap = Math.max(0, input.gap);
  const suffixWidth = Math.max(0, input.suffixWidth);

  // 首次渲染可能还拿不到宽度，先完整显示，避免提前出现 +N 闪烁。
  if (containerWidth <= 0) {
    return selectedCount;
  }

  const availableWidth = Math.max(0, containerWidth - rightSectionWidth);
  for (let visibleCount = selectedCount; visibleCount >= 1; visibleCount -= 1) {
    const hiddenCount = selectedCount - visibleCount;
    const tagsWidth = visibleCount * tagWidth + Math.max(0, visibleCount - 1) * gap;
    const suffixExtraWidth = hiddenCount > 0 ? gap + suffixWidth : 0;
    if (tagsWidth + suffixExtraWidth <= availableWidth) {
      return visibleCount;
    }
  }

  return 1;
}

export function getCategorySelectionState(
  category: SourceTreeCategoryNode,
  selectedFeedIds: ReadonlySet<string>,
): CategorySelectionState {
  const childCount = category.children.length;
  if (childCount === 0) {
    return 'unchecked';
  }

  let selectedCount = 0;
  for (const feed of category.children) {
    if (selectedFeedIds.has(feed.id)) {
      selectedCount += 1;
    }
  }

  if (selectedCount <= 0) return 'unchecked';
  if (selectedCount >= childCount) return 'checked';
  return 'indeterminate';
}

export function toggleFeedSelection(
  selectedFeedIds: string[],
  feedId: string,
  checked: boolean,
): string[] {
  const next = new Set(selectedFeedIds);
  if (checked) {
    next.add(feedId);
  } else {
    next.delete(feedId);
  }

  return sanitizeSelectedFeedIds([...next]);
}

export function toggleCategorySelection(
  selectedFeedIds: string[],
  category: SourceTreeCategoryNode,
  checked: boolean,
): string[] {
  const next = new Set(selectedFeedIds);

  // 分类级勾选只联动叶子节点，确保 payload 仍是 feed id 列表。
  for (const feed of category.children) {
    if (checked) {
      next.add(feed.id);
    } else {
      next.delete(feed.id);
    }
  }

  return sanitizeSelectedFeedIds([...next]);
}

function includesIgnoreCase(text: string, keyword: string): boolean {
  return text.toLocaleLowerCase('zh-Hans-CN').includes(keyword.toLocaleLowerCase('zh-Hans-CN'));
}

export function filterAiDigestSourceTreeData(
  treeData: SourceTreeCategoryNode[],
  query: string,
): SourceTreeCategoryNode[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return treeData;
  }

  const nextNodes: SourceTreeCategoryNode[] = [];
  for (const category of treeData) {
    if (includesIgnoreCase(category.title, normalizedQuery)) {
      nextNodes.push(category);
      continue;
    }

    const matchedChildren = category.children.filter((feed) =>
      includesIgnoreCase(feed.title, normalizedQuery),
    );
    if (matchedChildren.length <= 0) {
      continue;
    }

    nextNodes.push({
      ...category,
      children: matchedChildren,
    });
  }

  return nextNodes;
}
