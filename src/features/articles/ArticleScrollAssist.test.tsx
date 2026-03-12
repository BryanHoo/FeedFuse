import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleScrollAssist from './ArticleScrollAssist';

describe('ArticleScrollAssist', () => {
  it('does not render when visible is false', () => {
    const { container } = render(
      <ArticleScrollAssist visible={false} percent={0} onBackToTop={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a single circular back-to-top control with progress percent', () => {
    render(<ArticleScrollAssist visible percent={37} onBackToTop={vi.fn()} />);

    const backToTopButton = screen.getByRole('button', { name: '回到顶部' });
    const ringLayer = screen.getByTestId('article-scroll-assist-ring');
    const progressSvg = ringLayer.querySelector('svg');
    const progressCircles = ringLayer.querySelectorAll('circle');
    const label = screen.getByText('37%');

    expect(label).toBeInTheDocument();
    expect(backToTopButton).toHaveClass('h-10', 'w-10', 'rounded-full', 'bg-background/70');
    expect(backToTopButton.className).not.toContain('shadow-sm');
    expect(backToTopButton.className).not.toContain('[&_svg]:size-4');
    expect(ringLayer).toHaveClass('absolute', 'inset-[2px]', 'pointer-events-none');
    expect(progressSvg).toHaveClass('h-full', 'w-full', '-rotate-90');
    expect(progressCircles[0]).toHaveAttribute('r', '21');
    expect(progressCircles[0]).toHaveAttribute('stroke-width', '2.5');
    expect(progressCircles[0]).toHaveClass('stroke-border/45');
    expect(progressCircles[1]).toHaveClass('stroke-primary/75');
    expect(label).toHaveClass('text-foreground/90');
    expect(screen.queryByText('Top')).not.toBeInTheDocument();
  });

  it('clamps invalid percent values to the 0-100 range', () => {
    const { rerender } = render(
      <ArticleScrollAssist visible percent={-12} onBackToTop={vi.fn()} />,
    );

    expect(screen.getByText('0%')).toBeInTheDocument();

    rerender(<ArticleScrollAssist visible percent={160} onBackToTop={vi.fn()} />);

    expect(screen.getByText('Top')).toBeInTheDocument();
  });

  it('shows Top at the bottom while remaining the same clickable control', () => {
    render(<ArticleScrollAssist visible percent={100} onBackToTop={vi.fn()} />);

    expect(screen.getByRole('button', { name: '回到顶部' })).toBeInTheDocument();
    expect(screen.getByText('Top')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('calls onBackToTop when the button is clicked', () => {
    const onBackToTop = vi.fn();
    render(<ArticleScrollAssist visible percent={52} onBackToTop={onBackToTop} />);

    fireEvent.click(screen.getByRole('button', { name: '回到顶部' }));

    expect(onBackToTop).toHaveBeenCalledTimes(1);
  });
});
