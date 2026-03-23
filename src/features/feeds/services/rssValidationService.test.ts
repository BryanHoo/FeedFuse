import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearApiErrorNotifier, setApiErrorNotifier } from '@/lib/apiErrorNotifier';
import { validateRssUrl } from './rssValidationService';

describe('validateRssUrl', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns ok=true for success urls', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, data: { valid: true, kind: 'rss', title: 'Example' } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    const result = await validateRssUrl('https://example.com/success.xml');
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('rss');
  });

  it('maps 401/403/timeout/not-feed/dns-error to deterministic error codes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { valid: false, reason: 'unauthorized', message: '源站需要授权访问' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { valid: false, reason: 'unauthorized', message: '源站需要授权访问' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: { valid: false, reason: 'timeout', message: '校验超时，请稍后重试' },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              valid: false,
              reason: 'not_feed',
              message: '响应不是合法的 RSS/Atom 源',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              valid: false,
              reason: 'dns_error',
              message: '域名无法解析，请检查网络或 DNS 设置',
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
      );

    await expect(validateRssUrl('https://example.com/401.xml')).resolves.toMatchObject({
      ok: false,
      errorCode: 'unauthorized',
    });
    await expect(validateRssUrl('https://example.com/403.xml')).resolves.toMatchObject({
      ok: false,
      errorCode: 'unauthorized',
    });
    await expect(validateRssUrl('https://example.com/timeout.xml')).resolves.toMatchObject({
      ok: false,
      errorCode: 'timeout',
    });
    await expect(validateRssUrl('https://example.com/invalid.xml')).resolves.toMatchObject({
      ok: false,
      errorCode: 'not_feed',
    });
    await expect(validateRssUrl('https://example.com/dns.xml')).resolves.toMatchObject({
      ok: false,
      errorCode: 'dns_error',
    });
  });

  it('parses unified envelope and preserves invalid result as data', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: { valid: false, reason: 'unauthorized', message: '源站需要授权访问' },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    await expect(validateRssUrl('https://example.com/401.xml')).resolves.toEqual({
      ok: false,
      errorCode: 'unauthorized',
      message: '源站需要授权访问',
    });
  });

  it('does not notify on validation failures', async () => {
    const notifier = vi.fn();
    setApiErrorNotifier(notifier);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          data: { valid: false, reason: 'unauthorized', message: '源站需要授权访问' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await validateRssUrl('https://example.com/401.xml');
    expect(notifier).not.toHaveBeenCalled();

    clearApiErrorNotifier();
  });

  it('rejects invalid protocol', async () => {
    const result = await validateRssUrl('ftp://example.com/feed.xml');
    expect(result).toMatchObject({ ok: false, errorCode: 'invalid_url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
