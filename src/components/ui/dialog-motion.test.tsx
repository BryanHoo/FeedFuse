import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from './alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('dialog motion origin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the latest pointer position as DialogContent transform origin', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      if (this instanceof HTMLElement && this.dataset.testid === 'dialog-content') {
        return createRect(300, 200, 360, 240);
      }

      return createRect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <>
        <button type="button">打开</button>
      </>,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: '打开' }), {
      clientX: 120,
      clientY: 80,
    });

    rerender(
      <>
        <button type="button">打开</button>
        <Dialog open onOpenChange={() => {}}>
          <DialogContent data-testid="dialog-content">
            <DialogTitle>测试弹窗</DialogTitle>
            <DialogDescription>用于验证弹窗动画起点。</DialogDescription>
          </DialogContent>
        </Dialog>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveStyle({
        transformOrigin: '-180px -120px',
      });
    });
  });

  it('uses the latest pointer position as AlertDialogContent transform origin', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect() {
      if (this instanceof HTMLElement && this.dataset.testid === 'alert-dialog-content') {
        return createRect(260, 180, 320, 220);
      }

      return createRect(0, 0, 0, 0);
    });

    const { rerender } = render(
      <>
        <button type="button">删除</button>
      </>,
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: '删除' }), {
      clientX: 180,
      clientY: 110,
    });

    rerender(
      <>
        <button type="button">删除</button>
        <AlertDialog open onOpenChange={() => {}}>
          <AlertDialogContent data-testid="alert-dialog-content">
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>用于验证确认弹窗动画起点。</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      </>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toHaveStyle({
        transformOrigin: '-80px -70px',
      });
    });
  });
});
