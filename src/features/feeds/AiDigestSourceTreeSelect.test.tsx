import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Feed } from '../../types';
import AiDigestSourceTreeSelect from './AiDigestSourceTreeSelect';

function createFeed(input: Pick<Feed, 'id' | 'kind' | 'title'> & { categoryId?: string | null }): Feed {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    url: 'https://example.com/feed.xml',
    siteUrl: null,
    icon: undefined,
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
    categoryId: input.categoryId ?? null,
    category: null,
    fetchStatus: null,
    fetchError: null,
  };
}

describe('AiDigestSourceTreeSelect', () => {
  it('supports feed-level selection in tree dropdown', () => {
    const onChange = vi.fn();
    render(
      <AiDigestSourceTreeSelect
        categories={[{ id: 'cat-tech', name: '科技' }]}
        feeds={[createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' })]}
        selectedFeedIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 RSS 来源' }));
    fireEvent.click(screen.getByLabelText('选择来源 RSS 1'));

    expect(onChange).toHaveBeenCalledWith(['rss-1']);
  });

  it('supports category-level selection in tree dropdown', () => {
    const onChange = vi.fn();
    render(
      <AiDigestSourceTreeSelect
        categories={[{ id: 'cat-tech', name: '科技' }]}
        feeds={[
          createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' }),
          createFeed({ id: 'rss-2', kind: 'rss', title: 'RSS 2', categoryId: 'cat-tech' }),
          createFeed({ id: 'digest-1', kind: 'ai_digest', title: 'Digest', categoryId: 'cat-tech' }),
        ]}
        selectedFeedIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 RSS 来源' }));
    fireEvent.click(screen.getByLabelText('选择分类 科技'));

    expect(onChange).toHaveBeenCalledWith(['rss-1', 'rss-2']);
  });

  it('filters tree nodes by keyword', () => {
    const onChange = vi.fn();
    render(
      <AiDigestSourceTreeSelect
        categories={[
          { id: 'cat-tech', name: '科技' },
          { id: 'cat-design', name: '设计' },
        ]}
        feeds={[
          createFeed({ id: 'rss-1', kind: 'rss', title: 'AI 观察', categoryId: 'cat-tech' }),
          createFeed({ id: 'rss-2', kind: 'rss', title: '产品灵感', categoryId: 'cat-design' }),
        ]}
        selectedFeedIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 RSS 来源' }));
    fireEvent.change(screen.getByPlaceholderText('搜索来源或分类'), { target: { value: '产品' } });

    expect(screen.getByText('产品灵感')).toBeInTheDocument();
    expect(screen.queryByText('AI 观察')).not.toBeInTheDocument();
  });

  it('keeps dropdown content inside dialog container to avoid scroll lock', () => {
    const onChange = vi.fn();
    render(
      <Dialog open onOpenChange={vi.fn()}>
        <DialogContent data-testid="ai-digest-dialog-content" showCloseButton={false}>
          <DialogTitle>测试</DialogTitle>
          <DialogDescription>测试描述</DialogDescription>
          <AiDigestSourceTreeSelect
            categories={[{ id: 'cat-tech', name: '科技' }]}
            feeds={Array.from({ length: 30 }, (_, index) =>
              createFeed({
                id: `rss-${index + 1}`,
                kind: 'rss',
                title: `RSS ${index + 1}`,
                categoryId: 'cat-tech',
              }),
            )}
            selectedFeedIds={[]}
            onChange={onChange}
          />
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole('button', { name: '选择 RSS 来源' }));

    const dialogContent = screen.getByTestId('ai-digest-dialog-content');
    const searchInput = screen.getByPlaceholderText('搜索来源或分类');

    expect(dialogContent.contains(searchInput)).toBe(true);
  });
});
