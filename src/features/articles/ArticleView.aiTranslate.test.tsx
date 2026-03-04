import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type ApiClientModule = typeof import('../../lib/apiClient');

vi.mock('../../lib/apiClient', async () => {
  const actual = await vi.importActual<ApiClientModule>('../../lib/apiClient');
  return {
    ...actual,
    enqueueArticleAiTranslate: vi.fn(),
    getArticleTasks: vi.fn(),
  };
});

describe('ArticleView ai translate', () => {
  it('ai translate failed shows persisted error', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockResolvedValue({
      enqueued: true,
      jobId: 'job-1',
    });
    vi.mocked(apiClient.getArticleTasks).mockResolvedValue({
      fulltext: { type: 'fulltext', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      ai_summary: { type: 'ai_summary', status: 'idle', jobId: null, requestedAt: null, startedAt: null, finishedAt: null, attempts: 0, errorCode: null, errorMessage: null },
      ai_translate: { type: 'ai_translate', status: 'failed', jobId: 'job-1', requestedAt: null, startedAt: null, finishedAt: null, attempts: 1, errorCode: 'ai_rate_limited', errorMessage: '请求过于频繁，请稍后重试' },
    });

    const { useAppStore } = (await import('../../store/appStore')) as typeof import('../../store/appStore');
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled: true,
          categoryId: null,
          category: null,
          articleListDisplayMode: 'card',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    expect(await screen.findByText('请求过于频繁，请稍后重试')).toBeInTheDocument();
  });

  it('toggles between original and translation when translation exists', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockResolvedValue({
      enqueued: false,
      reason: 'already_translated',
    });

    const { useAppStore } = (await import('../../store/appStore')) as typeof import('../../store/appStore');
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled: true,
          categoryId: null,
          category: null,
          articleListDisplayMode: 'card',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          aiTranslationZhHtml: '<p>你好</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    expect(screen.getByText('Hello')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    expect(screen.getByText('你好')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '原文' }));
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders bilingual content in translation mode when bilingual html exists', async () => {
    const apiClient = await import('../../lib/apiClient');
    vi.mocked(apiClient.enqueueArticleAiTranslate).mockResolvedValue({
      enqueued: false,
      reason: 'already_translated',
    });

    const { useAppStore } = (await import('../../store/appStore')) as typeof import('../../store/appStore');
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled: true,
          categoryId: null,
          category: null,
          articleListDisplayMode: 'card',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Original paragraph</p>',
          aiTranslationZhHtml: '<p>翻译后的段落</p>',
          aiTranslationBilingualHtml:
            '<div class="ff-bilingual-block"><p class="ff-original">Original paragraph</p><p class="ff-translation">翻译后的段落</p></div>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    fireEvent.click(screen.getByRole('button', { name: '翻译' }));
    expect(screen.getByText('Original paragraph')).toBeInTheDocument();
    expect(screen.getByText('翻译后的段落')).toBeInTheDocument();
  });

  it('disables translate button when feed body translation is disabled', async () => {
    const { useAppStore } = (await import('../../store/appStore')) as typeof import('../../store/appStore');
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'Feed 1',
          url: 'https://example.com/rss.xml',
          unreadCount: 1,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          titleTranslateEnabled: true,
          bodyTranslateEnabled: false,
          categoryId: null,
          category: null,
          articleListDisplayMode: 'card',
        },
      ],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [
        {
          id: 'article-1',
          feedId: 'feed-1',
          title: 'Article 1',
          content: '<p>Hello</p>',
          summary: 'hello',
          publishedAt: new Date('2026-02-28T00:00:00.000Z').toISOString(),
          link: 'https://example.com/a1',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'all',
      selectedArticleId: 'article-1',
    });

    const { default: ArticleView } = await import('./ArticleView');
    render(<ArticleView />);

    expect(screen.getByRole('button', { name: '翻译' })).toBeDisabled();
  });
});
