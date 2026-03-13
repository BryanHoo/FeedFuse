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

    const viewport = screen.getByTestId('notification-viewport');
    expect(viewport.className).toContain('inset-x-0');
    expect(viewport.className).toContain('items-center');
    expect(viewport.className).toContain('top-3');
    expect(viewport.className).not.toContain('right-3');

    await act(async () => {
      toast.success('已保存');
    });

    const toastRoot = await screen.findByRole('status');
    expect(toastRoot.className).toContain(
      'max-w-[min(var(--layout-notification-viewport-max-width),calc(100vw-1rem))]',
    );
    expect(toastRoot.className).toContain('items-center');
    expect(toastRoot.className).toContain('rounded-xl');
    expect(toastRoot.className).toContain('data-[state=open]:slide-in-from-top-2');
    expect(toastRoot.className).toContain('data-[state=closed]:slide-out-to-top-2');
    expect(toastRoot.className).toContain('shadow-popover');
    expect(toastRoot.className).not.toContain('items-start');
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
