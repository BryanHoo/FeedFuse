import type { FormEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Feed } from '../../types';
import { useAiDigestDialogForm } from './useAiDigestDialogForm';

const addAiDigestMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../store/appStore', () => ({
  useAppStore: <TResult,>(selector: (state: { addAiDigest: typeof addAiDigestMock }) => TResult) =>
    selector({ addAiDigest: addAiDigestMock }),
}));

function createFeed(input: Pick<Feed, 'id' | 'kind' | 'title'>): Feed {
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
    categoryId: null,
    category: null,
    fetchStatus: null,
    fetchError: null,
  };
}

describe('useAiDigestDialogForm', () => {
  it('submits selectedFeedIds only', async () => {
    const { result } = renderHook(() =>
      useAiDigestDialogForm({
        categories: [{ id: 'cat-tech', name: '科技', expanded: true }],
        feeds: [createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1' })],
        onOpenChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.setTitle('日报');
      result.current.setPrompt('请解读');
      result.current.setSelectedFeedIds(['rss-1']);
    });

    await act(async () => {
      const submitEvent = {
        preventDefault() {},
      } as FormEvent<HTMLFormElement>;
      await result.current.handleSubmit(submitEvent);
    });

    expect(addAiDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedFeedIds: ['rss-1'] }),
    );
    expect(addAiDigestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ selectedCategoryIds: expect.anything() }),
    );
  });
});
