import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastHost } from './ToastHost';
import { toast } from './toast';
import { toastStore } from './toastStore';

describe('ToastHost', () => {
  it('renders viewport and shows toast messages', async () => {
    toastStore.getState().reset();

    render(<ToastHost />);

    expect(screen.getByTestId('notification-viewport')).toBeInTheDocument();

    await act(async () => {
      toast.success('已保存');
    });

    expect(await screen.findByText('已保存')).toBeInTheDocument();
  });

  it('clears pending toasts when the host unmounts', async () => {
    toastStore.getState().reset();

    const view = render(<ToastHost />);

    await act(async () => {
      toast.success('稍后关闭', { durationMs: 10000 });
    });

    expect(toastStore.getState().toasts).toHaveLength(1);

    view.unmount();

    expect(toastStore.getState().toasts).toHaveLength(0);
  });
});
