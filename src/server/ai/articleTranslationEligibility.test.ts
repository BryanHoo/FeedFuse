import { describe, expect, it } from 'vitest';
import { evaluateArticleBodyTranslationEligibility } from './articleTranslationEligibility';

describe('articleTranslationEligibility', () => {
  it('blocks translation for strong simplified Chinese metadata', () => {
    expect(
      evaluateArticleBodyTranslationEligibility({
        sourceLanguage: 'zh-CN',
        contentHtml: '<p>hello</p>',
        contentFullHtml: null,
        summary: null,
      }),
    ).toMatchObject({
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      source: 'metadata',
    });
  });

  it('falls back to heuristic for simplified Chinese body text', () => {
    expect(
      evaluateArticleBodyTranslationEligibility({
        sourceLanguage: null,
        contentHtml: '<p>这是一个支持 API、TypeScript 和 RSS 的简体中文正文。</p>',
        contentFullHtml: null,
        summary: null,
      }),
    ).toMatchObject({
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      source: 'heuristic',
    });
  });

  it('allows translation for traditional Chinese and Japanese text', () => {
    expect(
      evaluateArticleBodyTranslationEligibility({
        sourceLanguage: null,
        contentHtml: '<p>這是一篇繁體中文文章。</p>',
        contentFullHtml: null,
        summary: null,
      }).bodyTranslationEligible,
    ).toBe(true);

    expect(
      evaluateArticleBodyTranslationEligibility({
        sourceLanguage: null,
        contentHtml: '<p>これは日本語の記事です。</p>',
        contentFullHtml: null,
        summary: null,
      }).bodyTranslationEligible,
    ).toBe(true);
  });
});
