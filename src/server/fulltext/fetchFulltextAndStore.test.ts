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
});
