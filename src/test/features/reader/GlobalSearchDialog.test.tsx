import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleSearchItemDto } from '@/lib/api/apiClient';
import GlobalSearchDialog from '../../../features/reader/components/GlobalSearchDialog';

const searchArticlesMock = vi.fn();

vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/apiClient')>('@/lib/api/apiClient');
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

  it('更换关键词时立即移除旧结果，避免使用新关键词打开旧文章', async () => {
    searchArticlesMock.mockResolvedValue({ items: results });
    render(<GlobalSearchDialog open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    const input = screen.getByLabelText('搜索文章');
    fireEvent.change(input, { target: { value: 'FeedFuse' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    expect(screen.getByText('Feed 1')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: '另一篇文章' } });
    expect(screen.queryByText('Feed 1')).not.toBeInTheDocument();
  });

  it('旧请求完成后仍可取消尚未触发的新搜索', async () => {
    let resolveFirst!: (value: { items: ArticleSearchItemDto[] }) => void;
    searchArticlesMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFirst = resolve;
    })).mockResolvedValue({ items: [] });
    render(<GlobalSearchDialog open onOpenChange={vi.fn()} onSelectResult={vi.fn()} />);
    const input = screen.getByLabelText('搜索文章');
    fireEvent.change(input, { target: { value: 'first' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    fireEvent.change(input, { target: { value: 'second' } });
    await act(async () => { resolveFirst({ items: results }); });
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });

    expect(searchArticlesMock).toHaveBeenCalledTimes(1);
  });

  it('打开文章同步失败时显示错误并允许再次选择', async () => {
    const onSelectResult = vi.fn().mockImplementationOnce(() => {
      throw new Error('文章不可用');
    }).mockResolvedValue(undefined);
    searchArticlesMock.mockResolvedValue({ items: results });
    const onOpenChange = vi.fn();
    render(<GlobalSearchDialog open onOpenChange={onOpenChange} onSelectResult={onSelectResult} />);
    fireEvent.change(screen.getByLabelText('搜索文章'), { target: { value: 'FeedFuse' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /FeedFuse搜索/i })); });

    expect(screen.getByText('打开文章失败，请稍后重试')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    // 重新搜索后应解除选择中的状态，允许用户重试打开文章。
    fireEvent.change(screen.getByLabelText('搜索文章'), { target: { value: 'Feed' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(180); });
    const button = screen.getByRole('button', { name: /Feed 1/i });
    expect(button).toBeEnabled();
    await act(async () => { fireEvent.click(button); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
