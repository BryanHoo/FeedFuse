import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { notifyApiError } from '@/lib/apiErrorNotifier';
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

  it('renders newest toast first and keeps close buttons on every tone', async () => {
    toastStore.getState().reset();

    render(<ToastHost />);

    await act(async () => {
      toast.success('第一条');
      toast.info('第二条');
      toast.error('第三条');
    });

    const closeButtons = within(screen.getByTestId('notification-viewport')).getAllByRole('button', {
      name: '关闭提醒',
    });

    expect(closeButtons).toHaveLength(3);
    expect(closeButtons[0].parentElement).toHaveTextContent('第三条');
    expect(closeButtons[1].parentElement).toHaveTextContent('第二条');
    expect(closeButtons[2].parentElement).toHaveTextContent('第一条');

    fireEvent.click(closeButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText('第三条')).not.toBeInTheDocument();
    });
  });

  it('bridges api errors while mounted and clears bridge state on unmount', async () => {
    toastStore.getState().reset();

    const view = render(<ToastHost />);

    await act(async () => {
      notifyApiError('网络错误');
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('网络错误');
    expect(toastStore.getState().toasts).toHaveLength(1);

    view.unmount();

    await act(async () => {
      notifyApiError('卸载后不应出现');
    });

    expect(toastStore.getState().toasts).toHaveLength(0);
    expect(screen.queryByText('卸载后不应出现')).not.toBeInTheDocument();
  });
});
