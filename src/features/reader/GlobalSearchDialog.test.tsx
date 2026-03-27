import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleSearchItemDto } from '@/lib/apiClient';
import GlobalSearchDialog from './GlobalSearchDialog';

const searchArticlesMock = vi.fn();

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    searchArticles: (...args: unknown[]) => searchArticlesMock(...args),
  };
});

describe('GlobalSearchDialog', () => {
  const results: ArticleSearchItemDto[] = [
    {
      id: 'article-1',
      feedId: 'feed-1',
      feedTitle: 'Feed 1',
      title: 'FeedFuse 搜索',
      titleOriginal: 'FeedFuse Search',
      titleZh: 'FeedFuse 搜索',
      summary: 'summary',
      excerpt: 'FeedFuse 命中了搜索关键词',
      publishedAt: '2026-03-26T09:00:00.000Z',
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    searchArticlesMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('searches after input debounce and renders results', async () => {
    searchArticlesMock.mockResolvedValue({ items: results });

    render(
      <GlobalSearchDialog open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('搜索文章'), {
      target: { value: 'FeedFuse' },
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    expect(searchArticlesMock).toHaveBeenCalledWith(
      { keyword: 'FeedFuse', limit: 20 },
      { notifyOnError: false },
    );

    expect(screen.getByText('Feed 1')).toBeInTheDocument();
    expect(document.querySelectorAll('mark')).toHaveLength(2);
    expect(document.querySelector('mark')).toHaveClass('bg-warning/30', 'font-semibold');
    expect(screen.getByTestId('global-search-result-title-article-1')).toHaveClass('line-clamp-1');
    expect(screen.getByTestId('global-search-result-excerpt-article-1')).toHaveClass('line-clamp-2');
  });

  it('calls onSelectResult with the clicked item and query', async () => {
    const onSelectResult = vi.fn().mockResolvedValue(undefined);
    searchArticlesMock.mockResolvedValue({ items: results });

    render(
      <GlobalSearchDialog open onOpenChange={vi.fn()} onSelectResult={onSelectResult} />,
    );

    fireEvent.change(screen.getByLabelText('搜索文章'), {
      target: { value: 'FeedFuse' },
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    const resultButton = screen.getByRole('button', { name: /FeedFuse搜索/i });
    await act(async () => {
      fireEvent.click(resultButton);
      await Promise.resolve();
    });

    expect(onSelectResult).toHaveBeenCalledWith(results[0], 'FeedFuse');
  });

  it('keeps the result area scrollable and allows long result text to wrap', async () => {
    searchArticlesMock.mockResolvedValue({
      items: [
        {
          ...results[0],
          id: 'article-long',
          excerpt:
            'averyveryveryveryveryveryveryveryveryveryveryveryveryveryveryveryverylongexcerpt',
        },
      ],
    });

    render(
      <GlobalSearchDialog open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText('搜索文章'), {
      target: { value: 'FeedFuse' },
    });

    await act(async () => {
      vi.advanceTimersByTime(180);
      await Promise.resolve();
    });

    const dialog = screen.getByRole('dialog');
    const resultList = screen.getByRole('list');
    const resultButton = screen.getByRole('button', { name: /FeedFuse搜索/i });

    expect(dialog).toHaveClass('flex-col');
    expect(resultList.parentElement).toHaveClass('flex-1', 'overflow-y-auto', 'min-h-0');
    expect(resultButton).toHaveClass('whitespace-normal', 'min-w-0', 'items-start');
  });
});
