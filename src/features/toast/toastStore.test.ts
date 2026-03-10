import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    toastStore.getState().reset();
    vi.useRealTimers();
  });

  it('dedupes same dedupeKey within 1500ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));

    const id1 = toastStore.getState().push({ tone: 'success', message: '保存成功' });
    const id2 = toastStore.getState().push({ tone: 'success', message: '保存成功' });

    expect(id2).toBe(id1);
    expect(toastStore.getState().toasts).toHaveLength(1);
  });

  it('keeps max 3 toasts and prioritizes error retention', () => {
    toastStore.getState().push({ tone: 'success', message: 'A' });
    toastStore.getState().push({ tone: 'info', message: 'B' });
    toastStore.getState().push({ tone: 'error', message: 'C' });
    toastStore.getState().push({ tone: 'success', message: 'D' });

    const messages = toastStore.getState().toasts.map((t) => t.message);
    expect(messages).toEqual(['B', 'C', 'D']);
  });

  it('applies default duration by tone when durationMs is not provided', () => {
    const id = toastStore.getState().push({ tone: 'error', message: '操作失败' });
    const item = toastStore.getState().toasts.find((t) => t.id === id);
    expect(item?.durationMs).toBe(4500);
  });
});

