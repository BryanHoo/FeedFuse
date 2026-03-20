import { describe, expect, it, vi } from 'vitest';

describe('articleFilterService', () => {
  it('filters immediately when summary keywords match', async () => {
    const judgeAi = vi.fn();
    const { evaluateArticleFilter } = await import('./articleFilterService');

    const result = await evaluateArticleFilter({
      article: {
        title: 'Sponsored post',
        summary: 'Weekly roundup',
      },
      filter: {
        keyword: { enabled: true, keywords: ['Sponsored'] },
        ai: { enabled: true, prompt: '过滤广告' },
      },
      judgeAi,
    });

    expect(result.filterStatus).toBe('filtered');
    expect(result.filteredBy).toEqual(['keyword']);
    expect(judgeAi).not.toHaveBeenCalled();
  });

  it('uses fulltext for second-stage keyword matching when available', async () => {
    const judgeAi = vi.fn();
    const { evaluateArticleFilter } = await import('./articleFilterService');

    const result = await evaluateArticleFilter({
      article: {
        title: 'Daily roundup',
        summary: 'General summary',
      },
      filter: {
        keyword: { enabled: true, keywords: ['Sponsored'] },
        ai: { enabled: false, prompt: '' },
      },
      fullTextHtml: '<article><p>Sponsored partner content</p></article>',
      judgeAi,
    });

    expect(result.filterStatus).toBe('filtered');
    expect(result.evaluationSource).toBe('fulltext');
    expect(result.filteredBy).toEqual(['keyword']);
    expect(judgeAi).not.toHaveBeenCalled();
  });

  it('filters when only AI judge matches', async () => {
    const judgeAi = vi.fn().mockResolvedValue({
      ok: true,
      matched: true,
      errorMessage: null,
    });
    const { evaluateArticleFilter } = await import('./articleFilterService');

    const result = await evaluateArticleFilter({
      article: {
        title: 'Weekly roundup',
        summary: 'General summary',
      },
      filter: {
        keyword: { enabled: true, keywords: ['Sponsored'] },
        ai: { enabled: true, prompt: '过滤广告' },
      },
      judgeAi,
    });

    expect(result.filterStatus).toBe('filtered');
    expect(result.filteredBy).toEqual(['ai']);
  });

  it('returns error when AI judge fails after keyword miss', async () => {
    const judgeAi = vi.fn().mockResolvedValue({
      ok: false,
      matched: false,
      errorMessage: 'timeout',
    });
    const { evaluateArticleFilter } = await import('./articleFilterService');

    const result = await evaluateArticleFilter({
      article: {
        title: 'Weekly roundup',
        summary: 'General summary',
      },
      filter: {
        keyword: { enabled: true, keywords: ['Sponsored'] },
        ai: { enabled: true, prompt: '过滤广告' },
      },
      judgeAi,
    });

    expect(result.filterStatus).toBe('error');
    expect(result.isFiltered).toBe(false);
    expect(result.filterErrorMessage).toBe('timeout');
  });

  it('falls back to summary text when fulltext fetch failed', async () => {
    const judgeAi = vi.fn().mockResolvedValue({
      ok: true,
      matched: true,
      errorMessage: null,
    });
    const { evaluateArticleFilter } = await import('./articleFilterService');

    const result = await evaluateArticleFilter({
      article: {
        title: 'Weekly roundup',
        summary: 'A short sponsored teaser',
      },
      filter: {
        keyword: { enabled: false, keywords: [] },
        ai: { enabled: true, prompt: '过滤广告' },
      },
      fullTextError: 'Readability parse failed',
      judgeAi,
    });

    expect(result.filterStatus).toBe('filtered');
    expect(result.evaluationSource).toBe('summary');
    expect(judgeAi).toHaveBeenCalledWith(
      expect.objectContaining({
        articleText: expect.stringContaining('A short sponsored teaser'),
      }),
    );
  });
});
