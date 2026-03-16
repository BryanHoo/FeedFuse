import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiDigestDialogForm } from './useAiDigestDialogForm';

const addAiDigestMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addAiDigest: addAiDigestMock }),
}));

describe('useAiDigestDialogForm', () => {
  it('submits selectedFeedIds only', async () => {
    const { result } = renderHook(() =>
      useAiDigestDialogForm({
        categories: [{ id: 'cat-tech', name: '科技', expanded: true }],
        feeds: [{ id: 'rss-1', kind: 'rss', title: 'RSS 1' } as any],
        onOpenChange: vi.fn(),
      }),
    );

    act(() => {
      result.current.setTitle('日报');
      result.current.setPrompt('请解读');
      result.current.setSelectedFeedIds(['rss-1']);
    });

    await act(async () => {
      await result.current.handleSubmit({ preventDefault() {} } as any);
    });

    expect(addAiDigestMock).toHaveBeenCalledWith(
      expect.objectContaining({ selectedFeedIds: ['rss-1'] }),
    );
    expect(addAiDigestMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ selectedCategoryIds: expect.anything() }),
    );
  });
});
