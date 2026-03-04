import { describe, expect, it } from 'vitest';
import {
  QUEUE_CONTRACTS,
  getQueueCreateOptions,
  getQueueSendOptions,
  getWorkerOptions,
} from './contracts';

describe('queue contracts', () => {
  it('keeps ai jobs manual retry (retryLimit=0)', () => {
    expect(getQueueSendOptions('ai.summarize_article', { articleId: 'a1' }).retryLimit).toBe(0);
    expect(getQueueSendOptions('ai.translate_article_zh', { articleId: 'a1' }).retryLimit).toBe(0);
  });

  it('enables retry+dlq for fulltext/feed', () => {
    expect(getQueueCreateOptions('article.fetch_fulltext').deadLetter).toBe('dlq.article.fulltext');
    expect(getQueueCreateOptions('feed.fetch').retryLimit).toBeGreaterThan(0);
  });

  it('provides worker concurrency defaults', () => {
    expect(getWorkerOptions('feed.fetch').localConcurrency).toBeGreaterThanOrEqual(1);
    expect(Object.keys(QUEUE_CONTRACTS)).toContain('ai.translate_title_zh');
  });
});
