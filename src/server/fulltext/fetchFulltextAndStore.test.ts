import { beforeEach, describe, expect, it, vi } from 'vitest';

const getArticleByIdMock = vi.fn();
const setArticleFulltextMock = vi.fn();
const setArticleFulltextErrorMock = vi.fn();
const getAppSettingsMock = vi.fn();
const isSafeExternalUrlMock = vi.fn();
const sanitizeContentMock = vi.fn();
const extractFulltextMock = vi.fn();
const fetchHtmlMock = vi.fn();

vi.mock('../repositories/articlesRepo', () => ({
  getArticleById: (...args: unknown[]) => getArticleByIdMock(...args),
  setArticleFulltext: (...args: unknown[]) => setArticleFulltextMock(...args),
  setArticleFulltextError: (...args: unknown[]) => setArticleFulltextErrorMock(...args),
}));

vi.mock('../repositories/settingsRepo', () => ({
  getAppSettings: (...args: unknown[]) => getAppSettingsMock(...args),
}));

vi.mock('../rss/ssrfGuard', () => ({
  isSafeExternalUrl: (...args: unknown[]) => isSafeExternalUrlMock(...args),
}));

vi.mock('../rss/sanitizeContent', () => ({
  sanitizeContent: (...args: unknown[]) => sanitizeContentMock(...args),
}));

vi.mock('./extractFulltext', () => ({
  extractFulltext: (...args: unknown[]) => extractFulltextMock(...args),
}));

vi.mock('../http/externalHttpClient', () => ({
  fetchHtml: (...args: unknown[]) => fetchHtmlMock(...args),
}));

const challengeUrl =
  'https://mp.weixin.qq.com/mp/wappoc_appmsgcaptcha?poc_token=test&target_url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc';
const challengeHtml = `
  <div class="weui-msg">
    <div class="weui-msg__text-area">
      <h2 class="weui-msg__title">环境异常</h2>
      <p class="weui-msg__desc">当前环境异常，完成验证后即可继续访问。</p>
    </div>
  </div>
`;
const cloudflareChallengeHtml = `
  <html>
    <head>
      <title>Just a moment...</title>
    </head>
    <body>
      <main>
        <h1>Verify you are human</h1>
        <p>Complete the security check to access example.com</p>
        <div>Cloudflare Ray ID: 1234567890abcdef</div>
      </main>
    </body>
  </html>
`;

describe('fetchFulltextAndStore', () => {
  beforeEach(() => {
    getArticleByIdMock.mockReset();
    setArticleFulltextMock.mockReset();
    setArticleFulltextErrorMock.mockReset();
    getAppSettingsMock.mockReset();
    isSafeExternalUrlMock.mockReset();
    sanitizeContentMock.mockReset();
    extractFulltextMock.mockReset();
    fetchHtmlMock.mockReset();
    vi.unstubAllGlobals();
  });

  it('fetches html and stores sanitized content', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://example.com/a',
      contentFullHtml: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    extractFulltextMock.mockReturnValue({ contentHtml: '<main><p>World</p></main>', title: null });
    sanitizeContentMock.mockReturnValue('<p>World</p>');

    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/a',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body><main><p>World</p></main></body></html>',
    });

    const mod = (await import('./fetchFulltextAndStore')) as typeof import('./fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(fetchHtmlMock).toHaveBeenCalledWith(
      'https://example.com/a',
      expect.objectContaining({
        timeoutMs: 1000,
        userAgent: 'test-agent',
        maxBytes: 2 * 1024 * 1024,
        logging: {
          source: 'server/fulltext/fetchFulltextAndStore',
          requestLabel: 'Fulltext fetch',
          context: {
            articleId: 'article-1',
            articleLink: 'https://example.com/a',
          },
        },
      }),
    );
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>World</p>',
      sourceUrl: 'https://example.com/a',
    });
    expect(setArticleFulltextErrorMock).not.toHaveBeenCalled();
  });

  it('stores error instead of saving upstream verification pages as fulltext', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://mp.weixin.qq.com/s/abc',
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: challengeUrl,
      contentType: 'text/html; charset=utf-8',
      html: challengeHtml,
    });

    const mod = (await import('./fetchFulltextAndStore')) as typeof import('./fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(extractFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextErrorMock).toHaveBeenCalledWith(pool, 'article-1', {
      error: 'Verification required',
      sourceUrl: challengeUrl,
    });
  });

  it('stores verification error for generic anti-bot challenge pages', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://example.com/protected',
      contentFullHtml: null,
      contentFullSourceUrl: null,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/protected',
      contentType: 'text/html; charset=utf-8',
      html: cloudflareChallengeHtml,
    });

    const mod = (await import('./fetchFulltextAndStore')) as typeof import('./fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(extractFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextMock).not.toHaveBeenCalled();
    expect(setArticleFulltextErrorMock).toHaveBeenCalledWith(pool, 'article-1', {
      error: 'Verification required',
      sourceUrl: 'https://example.com/protected',
    });
  });

  it('refetches when the stored fulltext is only a verification page', async () => {
    const pool = {};

    getArticleByIdMock.mockResolvedValue({
      id: 'article-1',
      link: 'https://mp.weixin.qq.com/s/abc',
      contentFullHtml: '<h2>环境异常</h2><p>当前环境异常，完成验证后即可继续访问。</p>',
      contentFullSourceUrl: challengeUrl,
    });
    getAppSettingsMock.mockResolvedValue({ rssTimeoutMs: 1000, rssUserAgent: 'test-agent' });
    isSafeExternalUrlMock.mockResolvedValue(true);
    fetchHtmlMock.mockResolvedValue({
      status: 200,
      finalUrl: 'https://example.com/a',
      contentType: 'text/html; charset=utf-8',
      html: '<html><body><main><p>Recovered</p></main></body></html>',
    });
    extractFulltextMock.mockReturnValue({
      contentHtml: '<main><p>Recovered</p></main>',
      title: null,
    });
    sanitizeContentMock.mockReturnValue('<p>Recovered</p>');

    const mod = (await import('./fetchFulltextAndStore')) as typeof import('./fetchFulltextAndStore');
    await mod.fetchFulltextAndStore(pool as never, 'article-1');

    expect(fetchHtmlMock).toHaveBeenCalledTimes(1);
    expect(setArticleFulltextMock).toHaveBeenCalledWith(pool, 'article-1', {
      contentFullHtml: '<p>Recovered</p>',
      sourceUrl: 'https://example.com/a',
    });
  });
});
