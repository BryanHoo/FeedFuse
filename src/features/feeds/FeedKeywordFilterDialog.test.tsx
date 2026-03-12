import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../store/appStore';
import type { Feed } from '../../types';
import FeedKeywordFilterDialog from './FeedKeywordFilterDialog';

const getFeedKeywordFilterMock = vi.fn();
const patchFeedKeywordFilterMock = vi.fn();

vi.mock('../../lib/apiClient', () => ({
  getFeedKeywordFilter: (...args: unknown[]) => getFeedKeywordFilterMock(...args),
  patchFeedKeywordFilter: (...args: unknown[]) => patchFeedKeywordFilterMock(...args),
}));

function buildFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 'feed-1',
    title: '示例订阅',
    url: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
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
    categoryId: 'cat-tech',
    category: '科技',
    ...overrides,
  };
}

describe('FeedKeywordFilterDialog', () => {
  beforeEach(() => {
    getFeedKeywordFilterMock.mockReset();
    patchFeedKeywordFilterMock.mockReset();
  });

  it('loads existing keywords and saves newline-separated values', async () => {
    const loadSnapshot = vi.fn(async () => undefined);
    useAppStore.setState({ selectedView: 'feed-1', loadSnapshot });
    getFeedKeywordFilterMock.mockResolvedValue({ keywords: ['Sponsored'] });
    patchFeedKeywordFilterMock.mockResolvedValue({ keywords: ['Sponsored', 'Ads'] });
    const onOpenChange = vi.fn();

    render(
      <FeedKeywordFilterDialog
        open
        feed={buildFeed()}
        onOpenChange={onOpenChange}
      />,
    );

    expect(await screen.findByLabelText('文章关键词过滤规则')).toHaveValue('Sponsored');

    fireEvent.change(screen.getByLabelText('文章关键词过滤规则'), {
      target: { value: 'Sponsored\nAds' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(patchFeedKeywordFilterMock).toHaveBeenCalledWith('feed-1', {
        keywords: ['Sponsored', 'Ads'],
      });
      expect(loadSnapshot).toHaveBeenCalledWith({ view: 'feed-1' });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it('renders feed keyword textarea with flat shared input classes', async () => {
    getFeedKeywordFilterMock.mockResolvedValue({ keywords: [] });

    render(
      <FeedKeywordFilterDialog
        open
        feed={buildFeed()}
        onOpenChange={vi.fn()}
      />,
    );

    const textarea = await screen.findByLabelText('文章关键词过滤规则');
    expect(textarea.className).not.toContain('shadow-sm');
    expect(textarea).toHaveClass('rounded-md');
  });
});
