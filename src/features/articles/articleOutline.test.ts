import { describe, expect, it } from 'vitest';
import { extractArticleOutline } from './articleOutline';

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
