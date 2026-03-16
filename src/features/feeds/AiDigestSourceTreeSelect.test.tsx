import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiDigestSourceTreeSelect from './AiDigestSourceTreeSelect';

vi.mock('rc-tree-select', () => ({
  default: (props: any) => (
    <button
      type="button"
      onClick={() => props.onChange(['category:cat-tech', 'feed:rss-2', 'feed:rss-1'])}
    >
      trigger-tree
    </button>
  ),
  SHOW_CHILD: 'SHOW_CHILD',
}));

describe('AiDigestSourceTreeSelect', () => {
  it('emits feed ids only', () => {
    const onChange = vi.fn();
    render(
      <AiDigestSourceTreeSelect
        categories={[{ id: 'cat-tech', name: '科技' }]}
        feeds={[
          { id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' } as any,
          { id: 'rss-2', kind: 'rss', title: 'RSS 2', categoryId: 'cat-tech' } as any,
          { id: 'digest-1', kind: 'ai_digest', title: 'Digest', categoryId: 'cat-tech' } as any,
        ]}
        selectedFeedIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-tree' }));
    expect(onChange).toHaveBeenCalledWith(['rss-1', 'rss-2']);
  });
});
