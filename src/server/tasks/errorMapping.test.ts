import { describe, expect, it } from 'vitest';

describe('errorMapping', () => {
  it('maps Fulltext pending to fulltext_pending', async () => {
    const mod = await import('./errorMapping');
    expect(mod.mapTaskError({ type: 'ai_summary', err: new Error('Fulltext pending') })).toEqual({
      errorCode: 'fulltext_pending',
      errorMessage: expect.any(String),
    });
  });

  it('maps AbortError to ai_timeout', async () => {
    const mod = await import('./errorMapping');
    const err = new Error('aborted');
    (err as { name?: string }).name = 'AbortError';
    expect(mod.mapTaskError({ type: 'ai_translate', err })).toEqual({
      errorCode: 'ai_timeout',
      errorMessage: expect.any(String),
    });
  });

  it('maps fulltext Non-HTML response to fetch_non_html', async () => {
    const mod = await import('./errorMapping');
    expect(mod.mapTaskError({ type: 'fulltext', err: 'Non-HTML response' }).errorCode).toBe(
      'fetch_non_html',
    );
  });
});

