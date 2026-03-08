export type RssValidationErrorCode =
  | 'invalid_url'
  | 'unauthorized'
  | 'timeout'
  | 'not_feed'
  | 'network_error';

export interface RssValidationResult {
  ok: boolean;
  kind?: 'rss' | 'atom';
  title?: string;
  siteUrl?: string;
  errorCode?: RssValidationErrorCode;
  message?: string;
}

type RssValidationEnvelope =
  | {
      ok: true;
      data: {
        valid: boolean;
        reason?: RssValidationErrorCode;
        message?: string;
        kind?: 'rss' | 'atom';
        title?: string;
        siteUrl?: string;
      };
    }
  | {
      ok: false;
      error: {
        message: string;
      };
    };

function getBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost';
}

export async function validateRssUrl(url: string): Promise<RssValidationResult> {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      errorCode: 'invalid_url',
      message: '请输入完整链接，例如 https://example.com/feed.xml',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, errorCode: 'invalid_url', message: '链接必须以 http:// 或 https:// 开头' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const endpoint = new URL('/api/rss/validate', getBaseUrl());
    endpoint.searchParams.set('url', url);

    const res = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });

    const json: unknown = await res.json().catch(() => null);
    if (typeof json !== 'object' || json === null || !('ok' in json)) {
      return { ok: false, errorCode: 'network_error', message: '暂时无法验证链接，请稍后重试' };
    }

    const envelope = json as RssValidationEnvelope;

    if (!envelope.ok) {
      return {
        ok: false,
        errorCode: 'network_error',
        message: envelope.error.message,
      };
    }

    if (envelope.data.valid) {
      return {
        ok: true,
        kind: envelope.data.kind,
        title: envelope.data.title,
        siteUrl: envelope.data.siteUrl,
      };
    }

    return {
      ok: false,
      errorCode: envelope.data.reason,
      message: envelope.data.message,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, errorCode: 'timeout', message: '验证超时，请稍后重试' };
    }
    return { ok: false, errorCode: 'network_error', message: '暂时无法验证链接，请稍后重试' };
  } finally {
    clearTimeout(timeout);
  }
}
