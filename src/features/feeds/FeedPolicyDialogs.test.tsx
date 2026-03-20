import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Feed } from '../../types';
import FeedFulltextPolicyDialog from './FeedFulltextPolicyDialog';
import FeedSummaryPolicyDialog from './FeedSummaryPolicyDialog';
import FeedTranslationPolicyDialog from './FeedTranslationPolicyDialog';

function buildFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 'feed-1',
    title: '示例订阅',
    url: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
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
    categoryId: 'cat-tech',
    category: '科技',
    ...overrides,
  };
}

describe('FeedPolicyDialogs', () => {
  it('summary policy dialog saves aiSummaryOnFetchEnabled and aiSummaryOnOpenEnabled', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedSummaryPolicyDialog
        open
        feed={buildFeed()}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动生成摘要' }));
    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动生成摘要' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        aiSummaryOnFetchEnabled: true,
        aiSummaryOnOpenEnabled: true,
      });
    });
  });

  it('translation policy dialog saves 3 translation switches', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedTranslationPolicyDialog
        open
        feed={buildFeed()}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译标题' }));
    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        titleTranslateEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        bodyTranslateOnOpenEnabled: true,
      });
    });
  });

  it('maps legacy bodyTranslateEnabled into bodyTranslateOnOpenEnabled on initial render', () => {
    render(
      <FeedTranslationPolicyDialog
        open
        feed={buildFeed({
          bodyTranslateEnabled: true,
          bodyTranslateOnOpenEnabled: false,
        })}
        onOpenChange={() => {}}
        onSubmit={async () => undefined}
      />,
    );

    expect(screen.getByRole('switch', { name: '打开文章时自动翻译正文' })).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('fulltext policy dialog saves fullTextOnOpenEnabled and fullTextOnFetchEnabled', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedFulltextPolicyDialog
        open
        feed={buildFeed({ fullTextOnOpenEnabled: false, fullTextOnFetchEnabled: false })}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动抓取全文' }));
    fireEvent.click(screen.getByRole('switch', { name: '入库时自动抓取全文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        fullTextOnOpenEnabled: true,
        fullTextOnFetchEnabled: true,
      });
    });
  });
});
