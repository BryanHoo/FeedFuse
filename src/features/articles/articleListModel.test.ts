import { describe, expect, it } from 'vitest';
import type { Article, Feed } from '../../types';
import { AI_DIGEST_VIEW_ID } from '../../lib/view';
import { buildArticleListDerivedState } from './articleListModel';

function createFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 'feed-1',
    kind: 'rss',
    title: 'Example Feed',
    url: 'https://example.com/rss.xml',
    unreadCount: 0,
    enabled: true,
    fullTextOnOpenEnabled: false,
    fullTextOnFetchEnabled: false,
    aiSummaryOnOpenEnabled: false,
    aiSummaryOnFetchEnabled: false,
    bodyTranslateOnFetchEnabled: false,
    bodyTranslateOnOpenEnabled: false,
    titleTranslateEnabled: false,
    bodyTranslateEnabled: false,
    articleListDisplayMode: 'card',
    fetchStatus: null,
    fetchError: null,
    ...overrides,
  };
}

function createArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'article-1',
    feedId: 'feed-1',
    title: 'Article Title',
    content: '',
    summary: 'Summary',
    publishedAt: '2026-02-25T08:00:00.000Z',
    link: 'https://example.com/article-1',
    isRead: false,
    isStarred: false,
    ...overrides,
  };
}

describe('buildArticleListDerivedState', () => {
  it('在未读过滤开启时保留当前会话里已经可见的已读文章，并基于视图文章计算未读数', () => {
    const retainedVisibleArticleIds = new Set(['article-1']);

    const result = buildArticleListDerivedState({
      articles: [
        createArticle({ id: 'article-1', isRead: true }),
        createArticle({ id: 'article-2', publishedAt: '2026-02-25T07:00:00.000Z' }),
        createArticle({ id: 'article-3', isRead: true, publishedAt: '2026-02-24T08:00:00.000Z' }),
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
      showUnreadFilterActive: true,
      retainedVisibleArticleIds,
      aiDigestFeedIds: new Set(),
      referenceTime: new Date('2026-02-25T12:00:00.000Z'),
    });

    expect(result.unreadCount).toBe(1);
    expect(result.filteredArticles.map((article) => article.id)).toEqual(['article-1', 'article-2']);
    expect(Array.from(result.nextVisibleArticleIds)).toEqual(['article-1', 'article-2']);
    expect(result.articleSections.map((section) => section.articles.map((article) => article.id))).toEqual([
      ['article-1', 'article-2'],
    ]);
  });

  it('为 AI 解读视图筛选文章，并优先使用 previewImage 生成预览图索引', () => {
    const result = buildArticleListDerivedState({
      articles: [
        createArticle({
          id: 'digest-1',
          feedId: 'digest-feed',
          previewImage: 'https://img.example/preview.jpg',
          content: '<img src="https://img.example/fallback.jpg" />',
        }),
        createArticle({
          id: 'rss-1',
          feedId: 'rss-feed',
          content: '<img src="https://img.example/rss.jpg" />',
        }),
      ],
      selectedView: AI_DIGEST_VIEW_ID,
      selectedArticleId: null,
      showUnreadFilterActive: false,
      retainedVisibleArticleIds: new Set(),
      aiDigestFeedIds: new Set(['digest-feed']),
      referenceTime: new Date('2026-02-25T12:00:00.000Z'),
    });

    expect(result.viewScopedArticles.map((article) => article.id)).toEqual(['digest-1']);
    expect(result.previewImageByArticleId.get('digest-1')).toEqual({
      key: 'digest-1:https://img.example/preview.jpg',
      src: 'https://img.example/preview.jpg',
    });
    expect(Array.from(result.previewImageCandidates.entries())).toEqual([
      ['digest-1:https://img.example/preview.jpg', 'https://img.example/preview.jpg'],
    ]);
  });

  it('构建 feed 标题映射，避免列表渲染时重复扫描订阅源数组', () => {
    const result = buildArticleListDerivedState({
      articles: [createArticle()],
      feeds: [
        createFeed({ id: 'feed-1', title: 'Feed One' }),
        createFeed({ id: 'feed-2', title: 'Feed Two' }),
      ],
      selectedView: 'all',
      selectedArticleId: null,
      showUnreadFilterActive: false,
      retainedVisibleArticleIds: new Set(),
      aiDigestFeedIds: new Set(),
      referenceTime: new Date('2026-02-25T12:00:00.000Z'),
    });

    expect(result.feedTitleById.get('feed-1')).toBe('Feed One');
    expect(result.feedTitleById.get('feed-2')).toBe('Feed Two');
  });
});
