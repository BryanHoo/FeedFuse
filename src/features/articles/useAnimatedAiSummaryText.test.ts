import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnimatedAiSummaryText } from './useAnimatedAiSummaryText';

const originalMatchMedia = window.matchMedia;

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('useAnimatedAiSummaryText', () => {
  beforeEach(() => {
    vi.useRealTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('animates only newly appended summary text', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ articleId, sourceText, status }) =>
        useAnimatedAiSummaryText({ articleId, sourceText, status }),
      {
        initialProps: {
          articleId: 'article-1',
          sourceText: 'TL;DR',
          status: 'running' as const,
        },
      },
    );

    expect(result.current.displayText).toBe('TL;DR');

    rerender({
      articleId: 'article-1',
      sourceText: 'TL;DR\n- 第一条',
      status: 'running' as const,
    });

    expect(result.current.displayText).toBe('TL;DR');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(80);
    });

    expect(result.current.displayText.length).toBeGreaterThan('TL;DR'.length);
    expect(result.current.displayText).not.toBe('TL;DR\n- 第一条');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(result.current.displayText).toBe('TL;DR\n- 第一条');
  });

  it('snaps to the latest full text on article change and terminal states', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ articleId, sourceText, status }) =>
        useAnimatedAiSummaryText({ articleId, sourceText, status }),
      {
        initialProps: {
          articleId: 'article-1',
          sourceText: 'TL;DR',
          status: 'running' as const,
        },
      },
    );

    rerender({
      articleId: 'article-1',
      sourceText: 'TL;DR\n- 第一条',
      status: 'running' as const,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(result.current.displayText).not.toBe('TL;DR\n- 第一条');

    rerender({
      articleId: 'article-2',
      sourceText: '第二篇草稿',
      status: 'running' as const,
    });

    expect(result.current.displayText).toBe('第二篇草稿');

    rerender({
      articleId: 'article-2',
      sourceText: '第二篇最终摘要',
      status: 'succeeded' as const,
    });

    expect(result.current.displayText).toBe('第二篇最终摘要');
  });

  it('snaps immediately when the source text is corrected instead of appended', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(
      ({ articleId, sourceText, status }) =>
        useAnimatedAiSummaryText({ articleId, sourceText, status }),
      {
        initialProps: {
          articleId: 'article-1',
          sourceText: 'TL;DR',
          status: 'running' as const,
        },
      },
    );

    rerender({
      articleId: 'article-1',
      sourceText: 'TL;DR\n- 第一条',
      status: 'running' as const,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60);
    });

    expect(result.current.displayText).not.toBe('TL;DR\n- 第一条');

    rerender({
      articleId: 'article-1',
      sourceText: 'TL;DR\n- 第一项（纠偏）',
      status: 'running' as const,
    });

    expect(result.current.displayText).toBe('TL;DR\n- 第一项（纠偏）');
  });

  it('skips animation when reduced motion is preferred', () => {
    setReducedMotion(true);

    const { result, rerender } = renderHook(
      ({ articleId, sourceText, status }) =>
        useAnimatedAiSummaryText({ articleId, sourceText, status }),
      {
        initialProps: {
          articleId: 'article-1',
          sourceText: 'TL;DR',
          status: 'running' as const,
        },
      },
    );

    rerender({
      articleId: 'article-1',
      sourceText: 'TL;DR\n- 第一条',
      status: 'running' as const,
    });

    expect(result.current.displayText).toBe('TL;DR\n- 第一条');
  });
});
