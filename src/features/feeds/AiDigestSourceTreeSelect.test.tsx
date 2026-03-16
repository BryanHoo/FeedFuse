import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Feed } from '../../types';
import AiDigestSourceTreeSelect from './AiDigestSourceTreeSelect';

type MockTreeSelectProps = {
  onChange: (values: Array<string | number>) => void;
};

vi.mock('rc-tree-select', () => ({
  default: (props: MockTreeSelectProps) => (
    <button
      type="button"
      onClick={() => props.onChange(['category:cat-tech', 'feed:rss-2', 'feed:rss-1'])}
    >
      trigger-tree
    </button>
  ),
  SHOW_CHILD: 'SHOW_CHILD',
}));

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
  it('emits feed ids only', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'trigger-tree' }));
    expect(onChange).toHaveBeenCalledWith(['rss-1', 'rss-2']);
  });
});
