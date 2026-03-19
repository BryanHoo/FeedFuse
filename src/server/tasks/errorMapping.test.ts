import { describe, expect, it } from 'vitest';

describe('errorMapping', () => {
  it('maps Fulltext pending to fulltext_pending', async () => {
    const mod = await import('./errorMapping');
    expect(mod.mapTaskError({ type: 'ai_summary', err: new Error('Fulltext pending') })).toEqual({
      errorCode: 'fulltext_pending',
      errorMessage: expect.any(String),
      rawErrorMessage: 'Fulltext pending',
    });
  });

  it('maps AbortError to ai_timeout', async () => {
    const mod = await import('./errorMapping');
    const err = new Error('aborted');
    (err as { name?: string }).name = 'AbortError';
    expect(mod.mapTaskError({ type: 'ai_translate', err })).toEqual({
      errorCode: 'ai_timeout',
      errorMessage: expect.any(String),
      rawErrorMessage: 'aborted',
    });
  });

  it('maps fulltext Non-HTML response to fetch_non_html', async () => {
    const mod = await import('./errorMapping');
    expect(mod.mapTaskError({ type: 'fulltext', err: 'Non-HTML response' })).toEqual({
      errorCode: 'fetch_non_html',
      errorMessage: '返回内容不是可阅读的网页',
      rawErrorMessage: 'Non-HTML response',
    });
  });

  it('keeps rawErrorMessage when mapping rate-limit errors', async () => {
    const mod = await import('./errorMapping');

    expect(mod.mapTaskError({ type: 'ai_summary', err: new Error('429 rate limit') })).toEqual({
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });
  });

  it('prefers nested provider error message from cause when mapping AI errors', async () => {
    const mod = await import('./errorMapping');
    const err = new Error('OpenAI request failed');
    (err as Error & { cause?: unknown }).cause = {
      status: 429,
      error: {
        message: '429 rate limit',
      },
    };

    expect(mod.mapTaskError({ type: 'ai_translate', err })).toEqual({
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });
  });
});
