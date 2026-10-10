import type { Pool } from 'pg';
import { getArticleById, setArticleFulltext, setArticleFulltextError } from '@/server/domains/articles/repositories/articlesRepo';
import { getAppSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { fetchHtml } from '@/server/infra/http/externalHttpClient';
import { sanitizeContent } from '@/server/integrations/rss/sanitizeContent';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';
import { extractFulltext } from '@/server/integrations/fulltext/extractFulltext';
import {
  FULLTEXT_VERIFICATION_REQUIRED_ERROR,
  getUsableFulltextHtml,
  isFulltextVerificationPage,
} from '@/server/integrations/fulltext/fulltextVerification';

const MAX_HTML_BYTES = 2 * 1024 * 1024;

function isHtmlContentType(value: string | null): boolean {
  return typeof value === 'string' && value.toLowerCase().includes('text/html');
}

function toShortErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const name = typeof (err as { name?: unknown }).name === 'string' ? (err as { name: string }).name : '';
    if (name === 'AbortError') return 'timeout';
    const msg = err.message?.trim();
    return msg ? msg : 'Unknown error';
  }
  return 'Unknown error';
}

function assertNotVerificationPage(input: {
  html: string;
  sourceUrl: string | null;
}): void {
  if (isFulltextVerificationPage(input)) {
    throw new Error(FULLTEXT_VERIFICATION_REQUIRED_ERROR);
  }
}

export async function fetchFulltextAndStore(
  pool: Pool,
  articleId: string,
  userId?: string | null,
): Promise<void> {
  const article = await getArticleById(pool, articleId, userId ?? undefined);
  if (!article) return;

  // 队列重试或重复投递时复用已落库的有效正文，避免再次抓取和覆盖成功结果。
  if (getUsableFulltextHtml(article)) return;

  const link = article.link?.trim() ?? '';
  if (!link) {
    await setArticleFulltextError(pool, articleId, {
      userId: article.userId,
      error: 'Missing link',
      sourceUrl: null,
    });
    return;
  }

  if (!(await isSafeExternalUrl(link))) {
    await setArticleFulltextError(pool, articleId, {
      userId: article.userId,
      error: 'Unsafe URL',
      sourceUrl: link,
    });
    return;
  }

  const settings = await getAppSettings(pool);

  let sourceUrl: string | null = link;

  try {
    const res = await fetchHtml(link, {
      timeoutMs: settings.rssTimeoutMs,
      userAgent: settings.rssUserAgent,
      maxBytes: MAX_HTML_BYTES,
      logging: {
        userId: article.userId,
        source: 'server/fulltext/fetchFulltextAndStore',
        requestLabel: 'Fulltext fetch',
        context: {
          articleId,
          articleLink: link,
        },
      },
    });

    sourceUrl = res.finalUrl || sourceUrl;

    if (!(await isSafeExternalUrl(sourceUrl))) {
      throw new Error('Unsafe URL');
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`HTTP ${res.status}`);
    }

    if (!isHtmlContentType(res.contentType)) {
      throw new Error('Non-HTML response');
    }

    const html = res.html;
    assertNotVerificationPage({ html, sourceUrl });

    const extracted = extractFulltext({ html, url: sourceUrl });
    if (!extracted?.contentHtml) {
      throw new Error('Readability parse failed');
    }

    const sanitized = sanitizeContent(extracted.contentHtml, { baseUrl: sourceUrl });
    if (!sanitized) {
      throw new Error('Empty content');
    }
    assertNotVerificationPage({ html: sanitized, sourceUrl });

    await setArticleFulltext(pool, articleId, {
      userId: article.userId,
      contentFullHtml: sanitized,
      sourceUrl,
    });
  } catch (err) {
    await setArticleFulltextError(pool, articleId, {
      userId: article.userId,
      error: toShortErrorMessage(err),
      sourceUrl,
    });
  }
}
