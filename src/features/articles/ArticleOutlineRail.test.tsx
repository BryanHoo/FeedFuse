import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleOutlineRail from './ArticleOutlineRail';

const headings = [
  { id: 'article-outline-overview', level: 2 as const, text: 'Overview', topRatio: 0.1 },
  { id: 'article-outline-details', level: 3 as const, text: 'Details', topRatio: 0.6 },
];

describe('ArticleOutlineRail', () => {
  it('does not render when headings are empty', () => {
    const { container } = render(
      <ArticleOutlineRail
        headings={[]}
        activeHeadingId={null}
        viewport={{ top: 0, height: 1 }}
        onSelect={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('expands the card on hover', () => {
    render(
      <ArticleOutlineRail
        headings={headings}
        activeHeadingId="article-outline-overview"
        viewport={{ top: 0.1, height: 0.25 }}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByTestId('article-outline-rail'));

    expect(screen.getByRole('navigation', { name: '文章目录' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
  });
});
