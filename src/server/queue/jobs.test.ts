import { describe, expect, it } from 'vitest';
import {
  JOB_AI_SUMMARIZE,
  JOB_AI_TRANSLATE,
  JOB_AI_TRANSLATE_TITLE,
  JOB_ARTICLE_FULLTEXT_FETCH,
  JOB_FEED_FETCH,
  JOB_REFRESH_ALL,
} from './jobs';

describe('queue jobs', () => {
  it('exports stable job names', () => {
    expect(JOB_FEED_FETCH).toBe('feed.fetch');
    expect(JOB_REFRESH_ALL).toBe('feed.refresh_all');
    expect(JOB_AI_SUMMARIZE).toBe('ai.summarize_article');
    expect(JOB_AI_TRANSLATE).toBe('ai.translate_article_zh');
    expect(JOB_AI_TRANSLATE_TITLE).toBe('ai.translate_title_zh');
    expect(JOB_ARTICLE_FULLTEXT_FETCH).toBe('article.fetch_fulltext');
  });
});
