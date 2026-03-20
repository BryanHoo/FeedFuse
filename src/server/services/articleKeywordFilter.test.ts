import { describe, expect, it } from 'vitest';

describe('articleKeywordFilter', () => {
  it('returns global keywords only when keyword filtering is enabled', async () => {
    const mod = await import('./articleKeywordFilter');
    expect(
      mod.getArticleKeywordsForFeed(
        {
          enabled: true,
          keywords: ['Sponsored', '招聘'],
        },
        'feed-1',
      ),
    ).toEqual(['Sponsored', '招聘']);
    expect(
      mod.getArticleKeywordsForFeed(
        {
          enabled: false,
          keywords: ['Sponsored'],
        },
        'feed-1',
      ),
    ).toEqual([]);
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
