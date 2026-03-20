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

  it('dedupes ai digest jobs via singleton keys', () => {
    expect(getQueueSendOptions('ai.digest_tick', {}).singletonKey).toBe('ai.digest_tick');
    expect(getQueueSendOptions('ai.digest_generate', { runId: 'r1' }).singletonKey).toBe('r1');
  });

  it('enables retry+dlq for fulltext/feed', () => {
    expect(getQueueCreateOptions('article.fetch_fulltext').deadLetter).toBe('dlq.article.fulltext');
    expect(getQueueCreateOptions('article.filter').deadLetter).toBe('dlq.article.filter');
    expect(getQueueCreateOptions('feed.fetch').retryLimit).toBeGreaterThan(0);
  });

  it('provides worker concurrency defaults', () => {
    expect(getWorkerOptions('feed.fetch').localConcurrency).toBeGreaterThanOrEqual(1);
    expect(Object.keys(QUEUE_CONTRACTS)).toContain('ai.translate_title_zh');
    expect(Object.keys(QUEUE_CONTRACTS)).toContain('article.filter');
    expect(getWorkerOptions('system_logs.cleanup').localConcurrency).toBe(1);
    expect(getQueueSendOptions('system_logs.cleanup', {}).singletonKey).toBe('system_logs.cleanup');
  });

  it('dedupes article.filter jobs by article id', () => {
    expect(getQueueSendOptions('article.filter', { articleId: 'a1' }).singletonKey).toBe('a1');
    expect(getWorkerOptions('article.filter')).toEqual(
      expect.objectContaining({ localConcurrency: 3, batchSize: 1 }),
    );
  });
});
