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
  it('summary policy dialog keeps fetch/open mutually exclusive', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedSummaryPolicyDialog
        open
        feed={buildFeed()}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: '关闭 AI 摘要配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动生成摘要' }));
    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动生成摘要' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        aiSummaryOnFetchEnabled: false,
        aiSummaryOnOpenEnabled: true,
      });
    });
  });

  it('translation policy dialog keeps body translation fetch/open mutually exclusive', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedTranslationPolicyDialog
        open
        feed={buildFeed()}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: '关闭翻译配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译标题' }));
    fireEvent.click(screen.getByRole('switch', { name: '收到新文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动翻译正文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        titleTranslateEnabled: true,
        bodyTranslateOnFetchEnabled: false,
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

    expect(screen.getByRole('button', { name: '关闭翻译配置' })).toBeInTheDocument();

    expect(screen.getByRole('switch', { name: '打开文章时自动翻译正文' })).toHaveAttribute(
      'data-state',
      'checked',
    );
  });

  it('fulltext policy dialog keeps fetch/open mutually exclusive', async () => {
    const onSubmit = vi.fn(async () => undefined);

    render(
      <FeedFulltextPolicyDialog
        open
        feed={buildFeed({ fullTextOnOpenEnabled: false, fullTextOnFetchEnabled: false })}
        onOpenChange={() => {}}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: '关闭全文抓取配置' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: '打开文章时自动抓取全文' }));
    fireEvent.click(screen.getByRole('switch', { name: '入库时自动抓取全文' }));
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        fullTextOnOpenEnabled: false,
        fullTextOnFetchEnabled: true,
      });
    });
  });
});
