import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSettingsAutosave } from '../../../features/settings/hooks/useSettingsAutosave';

describe('useSettingsAutosave', () => {
  it.each([true, false])('忽略较旧版本晚到的保存结果（成功：%s）', async (oldOk) => {
    vi.useFakeTimers();
    try {
      const completions: Array<(result: { ok: boolean }) => void> = [];
      const saveDraft = vi.fn(() => new Promise<{ ok: boolean }>((resolve) => {
        completions.push(resolve);
      }));
      const { rerender, result, unmount } = renderHook(
        ({ tick }) => useSettingsAutosave({ draftVersion: tick, saveDraft, hasErrors: false }),
        { initialProps: { tick: 1 } },
      );
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      rerender({ tick: 2 });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      // 新版本先完成，旧版本随后返回也不能把“已保存”改回“保存中”或错误。
      await act(async () => { completions[1]({ ok: true }); });
      expect(result.current.status).toBe('saved');
      await act(async () => { completions[0]({ ok: oldOk }); });
      expect(result.current.status).toBe('saved');
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it('debounces saveDraft and exposes saving/saved status', async () => {
    vi.useFakeTimers();
    try {
      const saveDraft = vi.fn(async () => ({ ok: true }));

      const { rerender, result } = renderHook(
        ({ tick }) =>
          useSettingsAutosave({
            draftVersion: tick,
            saveDraft,
            hasErrors: false,
          }),
        { initialProps: { tick: 0 } },
      );

      act(() => {
        rerender({ tick: 1 });
      });
      expect(result.current.status).toBe('saving');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        await Promise.resolve();
      });
      expect(saveDraft).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('saved');
    } finally {
      vi.useRealTimers();
    }
  });

  it('exposes error status when saveDraft resolves with ok=false', async () => {
    vi.useFakeTimers();
    try {
      const saveDraft = vi.fn(async () => ({ ok: false }));

      const { rerender, result } = renderHook(
        ({ tick }) =>
          useSettingsAutosave({
            draftVersion: tick,
            saveDraft,
            hasErrors: false,
          }),
        { initialProps: { tick: 0 } },
      );

      act(() => {
        rerender({ tick: 1 });
      });
      expect(result.current.status).toBe('saving');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        await Promise.resolve();
      });
      expect(saveDraft).toHaveBeenCalledTimes(1);
      expect(result.current.status).toBe('error');
    } finally {
      vi.useRealTimers();
    }
  });
});
