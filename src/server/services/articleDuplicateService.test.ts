import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { ArticleRow } from '../repositories/articlesRepo';

function makeArticle(overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    id: '100',
    feedId: '1',
    dedupeKey: 'article-100',
    title: 'OpenAI launches a duplicate filter rollout',
    titleOriginal: 'OpenAI launches a duplicate filter rollout',
    titleZh: null,
    titleTranslationModel: null,
    titleTranslationAttempts: 0,
    titleTranslationError: null,
    titleTranslatedAt: null,
    link: 'https://example.com/articles/openai-duplicate-filter?utm_source=rss',
    author: 'Reporter',
    publishedAt: '2026-03-22T10:00:00.000Z',
    fetchedAt: '2026-03-22T10:05:00.000Z',
    contentHtml:
      '<p>OpenAI launches a duplicate filter rollout for syndicated feeds today.</p><p>The change reduces repeated posts across multiple sources.</p>',
    contentFullHtml: null,
    contentFullFetchedAt: null,
    contentFullError: null,
    contentFullSourceUrl: null,
    previewImageUrl: null,
    aiSummary: null,
    aiSummaryModel: null,
    aiSummarizedAt: null,
    aiTranslationBilingualHtml: null,
    aiTranslationZhHtml: null,
    aiTranslationModel: null,
    aiTranslatedAt: null,
    summary: 'The rollout reduces repeated posts across multiple feeds.',
    sourceLanguage: 'en',
    normalizedTitle: null,
    normalizedLink: null,
    contentFingerprint: null,
    duplicateOfArticleId: null,
    duplicateReason: null,
    duplicateScore: null,
    duplicateCheckedAt: null,
    filterStatus: 'pending',
    isFiltered: false,
    filteredBy: [],
    filterEvaluatedAt: null,
    filterErrorMessage: null,
    isRead: false,
    readAt: null,
    isStarred: false,
    starredAt: null,
    ...overrides,
  };
}

describe('articleDuplicateService', () => {
  it('matches same normalized url before content comparison', async () => {
    const { findDuplicateCandidate } = await import('./articleDuplicateService');
    const article = makeArticle({
      link: 'https://example.com/post?id=42&utm_source=rss&utm_medium=email',
      title: 'Breaking: duplicate filter arrives',
      contentHtml: '<p>Completely different body text that should not matter here.</p>',
    });
    const firstCandidate = makeArticle({
      id: '11',
      link: 'https://EXAMPLE.com/post?utm_campaign=feed&id=42',
      title: 'Other title',
      contentHtml: '<p>Another body.</p>',
    });
    const laterCandidate = makeArticle({
      id: '12',
      link: 'https://example.com/post?id=42&fbclid=123',
    });

    const result = findDuplicateCandidate({
      article,
      candidates: [firstCandidate, laterCandidate],
    });

    expect(result).toEqual(
      expect.objectContaining({
        matched: true,
        duplicateOfArticleId: '11',
        duplicateReason: 'same_normalized_url',
        duplicateScore: 1,
        normalizedLink: 'https://example.com/post?id=42',
      }),
    );
  });

  it('matches same normalized title when links differ', async () => {
    const { findDuplicateCandidate } = await import('./articleDuplicateService');
    const article = makeArticle({
      title: 'OpenAI, launches duplicate filters!!!',
      link: 'https://example.com/source-a',
    });
    const candidate = makeArticle({
      id: '21',
      title: 'openai launches duplicate filters',
      link: 'https://mirror.example.com/source-b',
      contentHtml: '<p>Different link but same story.</p>',
    });

    const result = findDuplicateCandidate({
      article,
      candidates: [candidate],
    });

    expect(result).toEqual(
      expect.objectContaining({
        matched: true,
        duplicateOfArticleId: '21',
        duplicateReason: 'same_title',
        duplicateScore: 1,
        normalizedTitle: 'openai launches duplicate filters',
      }),
    );
  });

  it('matches similar content after url and title checks miss', async () => {
    const { findDuplicateCandidate } = await import('./articleDuplicateService');
    const article = makeArticle({
      title: 'Vendor ships the rollout to more feeds',
      link: 'https://example.com/source-a',
      contentHtml:
        '<article><p>The new duplicate filter rollout reduces repeated syndicated posts across feed readers today.</p><p>Teams keep the earliest article and hide repeated rewrites by default.</p></article>',
    });
    const candidate = makeArticle({
      id: '31',
      title: 'Another newsroom reports the same release',
      link: 'https://example.com/source-b',
      contentFullHtml:
        '<div><p>The new duplicate filter rollout reduces repeated syndicated posts across feed readers today!</p><p>Teams keep the earliest article and hide repeated rewrites by default.</p></div>',
    });

    const result = findDuplicateCandidate({
      article,
      candidates: [candidate],
    });

    expect(result.matched).toBe(true);
    expect(result.duplicateOfArticleId).toBe('31');
    expect(result.duplicateReason).toBe('similar_content');
    expect(result.duplicateScore).toBeGreaterThanOrEqual(0.85);
    expect(result.contentFingerprint).toMatch(/^[a-f0-9]+$/);
  });

  it('skips similar_content when normalized text is too short', async () => {
    const { findDuplicateCandidate } = await import('./articleDuplicateService');

    const result = findDuplicateCandidate({
      article: makeArticle({
        title: '短讯',
        summary: '短讯',
        link: 'https://example.com/short-a',
        contentHtml: '<p>短讯</p>',
      }),
      candidates: [
        makeArticle({
          id: '41',
          title: '另一条短讯候选',
          link: 'https://example.com/short-b',
          contentHtml:
            '<p>The longer candidate should still be ignored because the current article text is too short.</p>',
        }),
      ],
    });

    expect(result.matched).toBe(false);
    expect(result.contentFingerprint).toBeNull();
  });

  it('returns unmatched when the earlier-article candidate window is empty', async () => {
    const { evaluateArticleDuplicate } = await import('./articleDuplicateService');
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    const result = await evaluateArticleDuplicate({
      pool,
      article: makeArticle(),
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(result).toEqual(
      expect.objectContaining({
        matched: false,
        duplicateOfArticleId: null,
        duplicateReason: null,
      }),
    );
  });
});
