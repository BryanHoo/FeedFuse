import type { FormEvent } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feed } from '../../types';
import { useAiDigestDialogForm } from './useAiDigestDialogForm';

const { runImmediateOperationMock } = vi.hoisted(() => ({
  runImmediateOperationMock: vi.fn(),
}));

const addAiDigestMock = vi.fn().mockResolvedValue(undefined);
const getAiDigestConfigMock = vi.fn().mockResolvedValue({
  feedId: 'digest-1',
  prompt: '请解读',
  intervalMinutes: 120,
  selectedFeedIds: ['rss-1'],
});
const updateAiDigestMock = vi.fn().mockResolvedValue(undefined);

vi.mock('../../store/appStore', () => ({
  useAppStore: <TResult,>(
    selector: (state: {
      addAiDigest: typeof addAiDigestMock;
      getAiDigestConfig: typeof getAiDigestConfigMock;
      updateAiDigest: typeof updateAiDigestMock;
    }) => TResult,
  ) =>
    selector({
      addAiDigest: addAiDigestMock,
      getAiDigestConfig: getAiDigestConfigMock,
      updateAiDigest: updateAiDigestMock,
    }),
}));

vi.mock('../notifications/userOperationNotifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../notifications/userOperationNotifier')>();

  return {
    ...actual,
    runImmediateOperation: (input: Parameters<typeof actual.runImmediateOperation>[0]) => {
      runImmediateOperationMock(input);
      return actual.runImmediateOperation(input);
    },
  };
});

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
  beforeEach(() => {
    addAiDigestMock.mockClear();
    getAiDigestConfigMock.mockClear();
    updateAiDigestMock.mockClear();
    runImmediateOperationMock.mockReset();
  });

  it('submits selectedFeedIds only', async () => {
    const categories = [{ id: 'cat-tech', name: '科技', expanded: true }];
    const feeds = [createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1' })];

    const { result } = renderHook(() =>
      useAiDigestDialogForm({
        mode: 'add',
        categories,
        feeds,
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
    expect(runImmediateOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'aiDigest.create' }),
    );
  });

  it('loads existing digest config in edit mode and submits update payload', async () => {
    const categories = [{ id: 'cat-tech', name: '科技', expanded: true }];
    const feeds = [createFeed({ id: 'rss-1', kind: 'rss', title: 'RSS 1' })];

    const { result } = renderHook(() =>
      useAiDigestDialogForm({
        mode: 'edit',
        feedId: 'digest-1',
        initialTitle: '原始标题',
        initialCategoryId: null,
        categories,
        feeds,
        onOpenChange: vi.fn(),
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.prompt).toBe('请解读');
    expect(result.current.intervalMinutes).toBe(120);
    expect(result.current.selectedFeedIds).toEqual(['rss-1']);

    act(() => {
      result.current.setTitle('更新标题');
      result.current.setPrompt('更新提示词');
      result.current.setSelectedFeedIds(['rss-1']);
    });

    await act(async () => {
      const submitEvent = {
        preventDefault() {},
      } as FormEvent<HTMLFormElement>;
      await result.current.handleSubmit(submitEvent);
    });

    expect(updateAiDigestMock).toHaveBeenCalledWith(
      'digest-1',
      expect.objectContaining({
        title: '更新标题',
        prompt: '更新提示词',
        intervalMinutes: 120,
        selectedFeedIds: ['rss-1'],
      }),
    );
    expect(runImmediateOperationMock).toHaveBeenCalledWith(
      expect.objectContaining({ actionKey: 'aiDigest.update' }),
    );
  });
});
