import { describe, expect, it } from 'vitest';
import {
  buildArticleOutlinePanelLayout,
  extractArticleOutline,
  shouldShowArticleOutline,
} from './articleOutline';

describe('extractArticleOutline', () => {
  it('extracts only h1 h2 h3 and assigns stable unique ids', () => {
    document.body.innerHTML = `
      <div>
        <h2>Overview</h2>
        <p>Body</p>
        <h4>Ignore me</h4>
        <h2>Overview</h2>
        <h3>Details</h3>
      </div>
    `;

    const root = document.body.firstElementChild as HTMLElement;
    const outline = extractArticleOutline(root);

    expect(outline.map((item) => item.level)).toEqual([2, 2, 3]);
    expect(outline.map((item) => item.text)).toEqual(['Overview', 'Overview', 'Details']);
    expect(outline.map((item) => item.id)).toEqual([
      'article-outline-overview',
      'article-outline-overview-2',
      'article-outline-details',
    ]);
  });
});

describe('shouldShowArticleOutline', () => {
  it('hides the outline when the rendered content height is too short', () => {
    expect(
      shouldShowArticleOutline({
        headingCount: 3,
        contentHeight: 1200,
        viewportHeight: 1000,
        isDesktop: true,
      }),
    ).toBe(false);
  });

  it('shows the outline when the article is long enough on desktop', () => {
    expect(
      shouldShowArticleOutline({
        headingCount: 2,
        contentHeight: 1600,
        viewportHeight: 1000,
        isDesktop: true,
      }),
    ).toBe(true);
  });
});

describe('buildArticleOutlinePanelLayout', () => {
  it('returns a visible panel with a clamped width when right-side gap is sufficient', () => {
    expect(
      buildArticleOutlinePanelLayout({
        viewportLeft: 0,
        viewportRight: 1200,
        contentRight: 860,
      }),
    ).toMatchObject({ visible: true, width: 220, right: 24 });
  });

  it('hides the panel when the right-side gap is below the threshold', () => {
    expect(
      buildArticleOutlinePanelLayout({
        viewportLeft: 0,
        viewportRight: 960,
        contentRight: 900,
      }),
    ).toMatchObject({ visible: false });
  });

  it('keeps the panel visible when the right-side gap can still fit a narrowed panel', () => {
    expect(
      buildArticleOutlinePanelLayout({
        viewportLeft: 0,
        viewportRight: 1080,
        contentRight: 860,
      }),
    ).toMatchObject({ visible: true, width: 180, right: 24 });
  });
});
