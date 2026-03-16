import type { Category, Feed } from '../../types';

export type SourceTreeNode = {
  title: string;
  value: string;
  key: string;
  children?: SourceTreeNode[];
  selectable?: boolean;
  disableCheckbox?: boolean;
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
}): SourceTreeNode[] {
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

  const nodes: SourceTreeNode[] = [];
  const renderedCategoryIds = new Set<string>();
  for (const category of input.categories) {
    const feeds = groupedFeeds.get(category.id) ?? [];
    if (feeds.length === 0) continue;

    nodes.push({
      title: category.name,
      value: getCategoryNodeValue(category.id),
      key: getCategoryNodeValue(category.id),
      children: feeds
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        .map((feed) => ({
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
      title: categoryNameById.get(UNCATEGORIZED_KEY) ?? UNCATEGORIZED_LABEL,
      value: getCategoryNodeValue(UNCATEGORIZED_KEY),
      key: getCategoryNodeValue(UNCATEGORIZED_KEY),
      children: uncategorizedFeeds
        .slice()
        .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
        .map((feed) => ({
          title: feed.title,
          value: getFeedNodeValue(feed.id),
          key: getFeedNodeValue(feed.id),
        })),
    });
  }

  return nodes;
}

export function collectSelectedFeedIds(values: Array<string | number>): string[] {
  const feedIds = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || !value.startsWith(FEED_PREFIX)) {
      continue;
    }

    const nextFeedId = value.slice(FEED_PREFIX.length).trim();
    if (!nextFeedId) continue;
    feedIds.add(nextFeedId);
  }

  return [...feedIds].sort((a, b) => a.localeCompare(b));
}

export function computeVisibleTagCount(input: {
  containerWidth: number;
  tagWidth: number;
  gap: number;
  suffixWidth: number;
}): number {
  const safeContainerWidth = Math.max(0, input.containerWidth);
  const safeTagWidth = Math.max(1, input.tagWidth);
  const safeGap = Math.max(0, input.gap);
  const safeSuffixWidth = Math.max(0, input.suffixWidth);

  if (safeContainerWidth <= safeTagWidth) {
    return 1;
  }

  // 预留 ...(+N) 的空间，避免标签超出后换行。
  const availableWidth = Math.max(0, safeContainerWidth - safeSuffixWidth);
  const perTagWidth = safeTagWidth + safeGap;
  const count = Math.floor((availableWidth + safeGap) / perTagWidth);

  return Math.max(1, count);
}
