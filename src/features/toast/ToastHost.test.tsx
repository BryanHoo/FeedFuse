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
    expect(toastRoot.className).toContain('rounded-2xl');
    expect(toastRoot.className).toContain('data-[state=open]:slide-in-from-top-2');
    expect(toastRoot.className).toContain('data-[state=closed]:slide-out-to-top-2');
    expect(toastRoot.className).not.toContain('shadow-');
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

  it('uses tinted semantic backgrounds and high-contrast icon chips for each tone', async () => {
    toastStore.getState().reset();

    render(<ToastHost />);

    await act(async () => {
      toast.success('成功提示');
      toast.info('信息提示');
      toast.error('错误提示');
    });

    const successToast = screen.getByText('成功提示').parentElement;
    const infoToast = screen.getByText('信息提示').parentElement;
    const errorToast = screen.getByText('错误提示').parentElement;

    expect(successToast?.className).toContain('color-mix(in_oklab,var(--color-success)_12%,white_88%)');
    expect(successToast?.className).toContain('border-success/30');
    expect(infoToast?.className).toContain('color-mix(in_oklab,var(--color-info)_12%,white_88%)');
    expect(infoToast?.className).toContain('border-info/30');
    expect(errorToast?.className).toContain('color-mix(in_oklab,var(--color-error)_14%,white_86%)');
    expect(errorToast?.className).toContain('border-error/34');

    expect(successToast?.firstElementChild?.className).toContain('bg-success/24');
    expect(successToast?.firstElementChild?.className).not.toContain('shadow-');
    expect(successToast?.firstElementChild?.firstElementChild?.getAttribute('class')).toContain(
      'text-success-foreground',
    );
    expect(infoToast?.firstElementChild?.className).toContain('bg-info/24');
    expect(infoToast?.firstElementChild?.className).not.toContain('shadow-');
    expect(infoToast?.firstElementChild?.firstElementChild?.getAttribute('class')).toContain(
      'text-info-foreground',
    );
    expect(errorToast?.firstElementChild?.className).toContain('bg-error/24');
    expect(errorToast?.firstElementChild?.className).not.toContain('shadow-');
    expect(errorToast?.firstElementChild?.firstElementChild?.getAttribute('class')).toContain(
      'text-error-foreground',
    );
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
