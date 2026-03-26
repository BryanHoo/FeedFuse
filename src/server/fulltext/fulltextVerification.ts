export const FULLTEXT_VERIFICATION_REQUIRED_ERROR = 'Verification required';

const WECHAT_VERIFICATION_URL_RE =
  /^https?:\/\/mp\.weixin\.qq\.com\/mp\/wappoc_appmsgcaptcha(?:[/?#]|$)/i;
const WECHAT_VERIFICATION_TEXT_MARKERS = ['环境异常', '完成验证后即可继续访问'] as const;
const CHALLENGE_URL_PATTERNS = [
  WECHAT_VERIFICATION_URL_RE,
  /^https?:\/\/[^/]+\/cdn-cgi\/challenge-platform(?:[/?#]|$)/i,
] as const;
const GENERIC_VERIFICATION_TEXT_MARKER_GROUPS = [
  ['verify you are human', 'cloudflare ray id'],
  ['just a moment', 'cloudflare'],
  ['checking your browser before accessing'],
  ['enable javascript and cookies to continue'],
  ['complete the security check to access'],
] as const;
const GENERIC_VERIFICATION_HTML_MARKERS = [
  '/cdn-cgi/challenge-platform/',
  'cf-chl-',
] as const;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToPlainText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function includesMarkerGroup(text: string, groups: readonly (readonly string[])[]): boolean {
  return groups.some((group) => group.every((marker) => text.includes(marker)));
}

export function isFulltextVerificationPage(input: {
  html?: string | null;
  sourceUrl?: string | null;
}): boolean {
  const sourceUrl = input.sourceUrl?.trim() ?? '';
  if (sourceUrl && CHALLENGE_URL_PATTERNS.some((pattern) => pattern.test(sourceUrl))) {
    return true;
  }

  const html = input.html?.trim() ?? '';
  if (!html) {
    return false;
  }

  const plain = htmlToPlainText(html);
  if (WECHAT_VERIFICATION_TEXT_MARKERS.every((marker) => plain.includes(marker))) {
    return true;
  }

  const normalizedPlain = plain.toLowerCase();
  if (includesMarkerGroup(normalizedPlain, GENERIC_VERIFICATION_TEXT_MARKER_GROUPS)) {
    return true;
  }

  // 反爬挑战页经常把关键标识藏在 HTML 属性和值里，纯文本会丢失一部分信号。
  const normalizedHtml = html.toLowerCase();
  return GENERIC_VERIFICATION_HTML_MARKERS.some((marker) => normalizedHtml.includes(marker));
}

export function getUsableFulltextHtml(input: {
  contentFullHtml?: string | null;
  contentFullSourceUrl?: string | null;
}): string | null {
  const contentFullHtml = input.contentFullHtml;
  if (!contentFullHtml?.trim()) {
    return null;
  }

  return isFulltextVerificationPage({
    html: contentFullHtml,
    sourceUrl: input.contentFullSourceUrl ?? null,
  })
    ? null
    : contentFullHtml;
}

export function isFulltextPending(
  input: {
  contentFullHtml?: string | null;
  contentFullSourceUrl?: string | null;
  contentFullError?: string | null;
  },
  fullTextOnOpenEnabled: boolean | null,
): boolean {
  return (
    fullTextOnOpenEnabled === true &&
    !getUsableFulltextHtml(input) &&
    !input.contentFullError
  );
}
