import { describe, expect, it } from 'vitest';

describe('articleKeywordFilter', () => {
  it('merges global and feed keywords for a feed', async () => {
    const mod = await import('./articleKeywordFilter');
    expect(
      mod.getArticleKeywordsForFeed(
        {
          globalKeywords: ['Sponsored'],
          feedKeywordsByFeedId: { 'feed-1': ['招聘'] },
        },
        'feed-1',
      ),
    ).toEqual(['Sponsored', '招聘']);
  });

  it('matches keywords against title and summary case-insensitively', async () => {
    const mod = await import('./articleKeywordFilter');
    expect(
      mod.matchesArticleKeywordFilter(
        { title: 'Sponsored Post', summary: 'Weekly digest' },
        ['sponsored'],
      ),
    ).toBe(true);
    expect(
      mod.matchesArticleKeywordFilter(
        { title: 'Daily News', summary: 'Hiring update' },
        ['招聘', 'hiring'],
      ),
    ).toBe(true);
  });
});
