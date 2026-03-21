import type { Article, Feed, ViewType } from '../../types';
import { AI_DIGEST_VIEW_ID } from '../../lib/view';
import { getArticleSectionHeading, getLocalDayKey } from '../../utils/date';

export interface ArticlePreviewImage {
  key: string;
  src: string;
}

export interface ArticleSection {
  key: string;
  title: string;
  articles: Article[];
}

interface BuildArticleListDerivedStateInput {
  articles: Article[];
  feeds?: Feed[];
  selectedView: ViewType;
  selectedArticleId: string | null;
  showUnreadFilterActive: boolean;
  retainedVisibleArticleIds: Set<string>;
  aiDigestFeedIds: Set<string>;
  referenceTime: Date;
}

interface BuildArticleListDerivedStateResult {
  feedById: Map<string, Feed>;
  feedTitleById: Map<string, string>;
  viewScopedArticles: Article[];
  filteredArticles: Article[];
  unreadCount: number;
  articleSections: ArticleSection[];
  previewImageByArticleId: Map<string, ArticlePreviewImage>;
  previewImageCandidates: Map<string, string>;
  nextVisibleArticleIds: Set<string>;
}

function getPreviewImage(content: string) {
  const match = content.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1] ?? null;
}

export function buildArticleListDerivedState(
  input: BuildArticleListDerivedStateInput,
): BuildArticleListDerivedStateResult {
  const feedById = new Map<string, Feed>();
  const feedTitleById = new Map<string, string>();

  for (const feed of input.feeds ?? []) {
    feedById.set(feed.id, feed);
    feedTitleById.set(feed.id, feed.title);
  }

  const viewScopedArticles: Article[] = [];
  for (const article of input.articles) {
    if (input.selectedView === 'all' || input.selectedView === 'unread') {
      viewScopedArticles.push(article);
      continue;
    }

    if (input.selectedView === 'starred') {
      if (article.isStarred) {
        viewScopedArticles.push(article);
      }
      continue;
    }

    if (input.selectedView === AI_DIGEST_VIEW_ID) {
      if (input.aiDigestFeedIds.has(article.feedId)) {
        viewScopedArticles.push(article);
      }
      continue;
    }

    if (article.feedId === input.selectedView) {
      viewScopedArticles.push(article);
    }
  }

  let unreadCount = 0;
  const filteredArticles: Article[] = [];
  const nextVisibleArticleIds = new Set<string>();

  // Collapse view filtering, unread retention, section grouping, and preview lookup into one derived path.
  for (const article of viewScopedArticles) {
    if (!article.isRead) {
      unreadCount += 1;
    }

    const shouldKeepArticle =
      !input.showUnreadFilterActive ||
      !article.isRead ||
      input.retainedVisibleArticleIds.has(article.id) ||
      article.id === input.selectedArticleId;

    if (!shouldKeepArticle) {
      continue;
    }

    filteredArticles.push(article);

    if (input.showUnreadFilterActive) {
      nextVisibleArticleIds.add(article.id);
    }
  }

  const articleSections: ArticleSection[] = [];
  const previewImageByArticleId = new Map<string, ArticlePreviewImage>();
  const previewImageCandidates = new Map<string, string>();
  let currentSection: ArticleSection | null = null;

  for (const article of filteredArticles) {
    const publishedDate = new Date(article.publishedAt);
    const hasValidDate = !Number.isNaN(publishedDate.getTime());
    const sectionKey = hasValidDate ? getLocalDayKey(publishedDate) : 'unknown';

    if (!currentSection || currentSection.key !== sectionKey) {
      currentSection = {
        key: sectionKey,
        title: hasValidDate
          ? getArticleSectionHeading(publishedDate, input.referenceTime)
          : '未知日期',
        articles: [],
      };
      articleSections.push(currentSection);
    }

    currentSection.articles.push(article);

    const previewImage = article.previewImage ?? getPreviewImage(article.content);
    if (!previewImage) {
      continue;
    }

    const preview = {
      key: `${article.id}:${previewImage}`,
      src: previewImage,
    };

    previewImageByArticleId.set(article.id, preview);
    previewImageCandidates.set(preview.key, preview.src);
  }

  return {
    feedById,
    feedTitleById,
    viewScopedArticles,
    filteredArticles,
    unreadCount,
    articleSections,
    previewImageByArticleId,
    previewImageCandidates,
    nextVisibleArticleIds,
  };
}
