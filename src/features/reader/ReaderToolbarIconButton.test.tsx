import { act, fireEvent, render, screen } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import ReaderToolbarIconButton from './ReaderToolbarIconButton';

function mockRect(
  element: Element,
  rect: {
    top: number;
    left: number;
    width: number;
    height: number;
  },
) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: rect.left,
      y: rect.top,
      top: rect.top,
      left: rect.left,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }),
  });
}

describe('ReaderToolbarIconButton', () => {
  it('shows a Chinese tooltip and keeps aria-label semantics', async () => {
    const onClick = vi.fn();

    render(
      <ReaderToolbarIconButton
        icon={Sparkles}
        label="生成摘要"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole('button', { name: '生成摘要' });
    expect(button).not.toHaveAttribute('title');

    fireEvent.focus(button);
    expect(await screen.findByText('生成摘要')).toBeInTheDocument();
    expect(document.body.querySelector('[data-side="bottom"]')).toHaveClass(
      'bg-popover',
      'text-popover-foreground',
    );
    expect(document.body.querySelector('[data-side="bottom"]')).not.toHaveClass('bg-black/80');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps tooltip available even when the button is disabled', async () => {
    vi.useFakeTimers();
    try {
      render(
        <ReaderToolbarIconButton
          icon={Sparkles}
          label="生成摘要"
          disabled
        />,
      );

      const button = screen.getByRole('button', { name: '生成摘要' });
      expect(button).toBeDisabled();

      await act(async () => {
        fireEvent.pointerMove(button.parentElement as HTMLElement, {
          clientX: 110,
          clientY: 110,
          pointerType: 'mouse',
        });
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(screen.getByText('生成摘要')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders pressed state with reader active styling', () => {
    render(
      <ReaderToolbarIconButton
        icon={Sparkles}
        label="仅显示未读文章"
        pressed
      />,
    );

    expect(screen.getByRole('button', { name: '仅显示未读文章' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('hides tooltip once the pointer leaves the trigger, even when moving toward tooltip content', async () => {
    vi.useFakeTimers();
    try {
      render(
        <ReaderToolbarIconButton
          icon={Sparkles}
          label="收藏"
        />,
      );

      const button = screen.getByRole('button', { name: '收藏' });
      mockRect(button, { top: 100, left: 100, width: 24, height: 24 });

      await act(async () => {
        fireEvent.pointerMove(button, {
          clientX: 112,
          clientY: 112,
          pointerType: 'mouse',
        });
        await vi.advanceTimersByTimeAsync(150);
      });

      const tooltipLabel = document.body.querySelector(
        '[data-radix-popper-content-wrapper] [aria-hidden="true"]',
      );
      const tooltipContent = tooltipLabel?.parentElement ?? null;
      expect(tooltipContent).not.toBeNull();

      mockRect(tooltipContent as Element, { top: 128, left: 90, width: 80, height: 28 });

      act(() => {
        fireEvent.pointerLeave(button, {
          clientX: 112,
          clientY: 124,
          pointerType: 'mouse',
          relatedTarget: tooltipContent,
        });
        fireEvent.mouseLeave(button, {
          clientX: 112,
          clientY: 124,
          relatedTarget: tooltipContent,
        });
        fireEvent.pointerMove(tooltipContent as Element, {
          clientX: 112,
          clientY: 132,
          pointerType: 'mouse',
        });
      });

      expect(
        document.body.contains(tooltipContent as HTMLElement),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the tooltip after a pointer click and keeps it hidden after leaving', async () => {
    vi.useFakeTimers();
    try {
      render(
        <ReaderToolbarIconButton
          icon={Sparkles}
          label="稍后阅读"
        />,
      );

      const button = screen.getByRole('button', { name: '稍后阅读' });
      mockRect(button, { top: 100, left: 100, width: 24, height: 24 });

      await act(async () => {
        fireEvent.pointerMove(button, {
          clientX: 112,
          clientY: 112,
          pointerType: 'mouse',
        });
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(screen.getByRole('tooltip', { name: '稍后阅读' })).toBeInTheDocument();

      act(() => {
        fireEvent.pointerDown(button, {
          clientX: 112,
          clientY: 112,
          pointerType: 'mouse',
        });
        fireEvent.focus(button);
        fireEvent.click(button);
      });

      expect(screen.queryByRole('tooltip', { name: '稍后阅读' })).not.toBeInTheDocument();

      act(() => {
        fireEvent.pointerLeave(button, {
          clientX: 112,
          clientY: 124,
          pointerType: 'mouse',
        });
        fireEvent.mouseLeave(button, {
          clientX: 112,
          clientY: 124,
        });
      });

      expect(screen.queryByRole('tooltip', { name: '稍后阅读' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
