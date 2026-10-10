import { describe, expect, it } from 'vitest';
import {
  QUEUE_CONTRACTS,
  getQueueCreateOptions,
  getQueueSendOptions,
  getWorkerOptions,
} from '@/server/infra/queue/contracts';

describe('queue contracts', () => {
  it('keeps ai jobs manual retry (retryLimit=0)', () => {
    expect(getQueueSendOptions('ai.summarize_article', { articleId: 'a1' }).retryLimit).toBe(0);
    expect(getQueueSendOptions('ai.translate_article_zh', { articleId: 'a1' }).retryLimit).toBe(0);
  });

  it('lets the queue retry title translation twice with backoff and preserves deduplication', () => {
    const queue = getQueueCreateOptions('ai.translate_title_zh');
    const send = getQueueSendOptions('ai.translate_title_zh', { userId: 'u1', articleId: 'a1' });

    // pg-boss 的 retryLimit 不含首次执行；发送选项不能覆盖队列的两次重试。
    expect({ ...queue, ...send }).toMatchObject({
      retryLimit: 2,
      retryBackoff: true,
      singletonKey: 'u1:a1',
      singletonSeconds: 600,
    });
    expect(queue.retryDelay).toBeGreaterThan(0);
    expect(send).not.toHaveProperty('retryLimit');
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

  it('isolates fulltext failures to one job while preserving concurrency', () => {
    // pg-boss 按整个回调结算失败，单条批次避免其他文章被连带重试或消耗重试预算。
    expect(getWorkerOptions('article.fetch_fulltext')).toMatchObject({
      localConcurrency: 4,
      batchSize: 1,
    });
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

  it('runs the independent article filter recovery scanner serially', () => {
    expect(getWorkerOptions('article.filter_recover')).toMatchObject({ localConcurrency: 1, batchSize: 1 });
    expect(getQueueSendOptions('article.filter_recover', {})).toEqual({
      singletonKey: 'article.filter_recover', singletonSeconds: 55,
    });
  });

  it('keeps fever sync dedupe window short for repeated manual sync', () => {
    expect(getQueueSendOptions('fever.sync', { accountId: 'account-1' })).toEqual({
      singletonKey: 'account-1',
      singletonSeconds: 5,
    });
  });

  it('keeps fever sync deduped by account even when tracking a refresh run', () => {
    expect(getQueueSendOptions('fever.sync', { accountId: 'account-1', runId: 'run-1' })).toEqual({
      singletonKey: 'account-1',
      singletonSeconds: 5,
    });
  });

  it('dedupes fever auto sync scheduler jobs by queue singleton', () => {
    expect(getQueueSendOptions('fever.sync_due', {})).toEqual({
      singletonKey: 'fever.sync_due',
      singletonSeconds: 55,
    });
    expect(getWorkerOptions('fever.sync_due')).toEqual(
      expect.objectContaining({ localConcurrency: 1, batchSize: 1 }),
    );
  });
});
