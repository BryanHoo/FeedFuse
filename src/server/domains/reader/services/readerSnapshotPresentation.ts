import { getServerEnv } from '@/server/infra/env';
import { buildImageProxyUrl, getOptionalImageProxySecret } from '@/server/integrations/media/imageProxyUrl';

// 列表快照集中处理图片地址与摘要长度，避免展示逻辑混入分页查询。
const SNAPSHOT_SUMMARY_MAX_CODE_POINTS = 280;
const HTML_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00A0',
};

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (match, decimal, hex, named) => {
    if (decimal) {
      return String.fromCodePoint(Number.parseInt(decimal, 10));
    }

    if (hex) {
      return String.fromCodePoint(Number.parseInt(hex, 16));
    }

    return HTML_ENTITY_MAP[named.toLowerCase()] ?? match;
  });
}

function isExpiredSignedImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const expiresAt = url.searchParams.get('x-expires');
    if (!expiresAt || !/^\d+$/.test(expiresAt)) {
      return false;
    }

    return Number.parseInt(expiresAt, 10) * 1000 <= Date.now();
  } catch {
    return false;
  }
}

function rewriteImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;

  const normalizedImageUrl = decodeHtmlEntities(imageUrl).trim();
  if (!normalizedImageUrl) return null;
  if (normalizedImageUrl.startsWith('/')) return normalizedImageUrl;
  if (isExpiredSignedImageUrl(normalizedImageUrl)) return null;

  const secret = getOptionalImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (!secret) return normalizedImageUrl;

  return buildImageProxyUrl({
    sourceUrl: normalizedImageUrl,
    secret,
  });
}

export function rewritePreviewImage(previewImage: string | null): string | null {
  if (!previewImage) return null;

  const normalizedImageUrl = decodeHtmlEntities(previewImage).trim();
  if (!normalizedImageUrl) return null;
  if (normalizedImageUrl.startsWith('/')) return normalizedImageUrl;
  if (isExpiredSignedImageUrl(normalizedImageUrl)) return null;

  const secret = getOptionalImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (!secret) return normalizedImageUrl;

  // 卡片按 96x82 CSS 像素展示，生成 2x 缩略图兼顾高分屏清晰度与传输体积。
  return buildImageProxyUrl({
    sourceUrl: normalizedImageUrl,
    secret,
    width: 192,
    height: 164,
    quality: 72,
  });
}

export function rewriteFeedIcon(iconUrl: string | null): string | null {
  return rewriteImageUrl(iconUrl);
}

export function normalizeSnapshotSummary(summary: string | null): string | null {
  if (!summary) return null;

  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;

  const codePoints = Array.from(normalized);
  if (codePoints.length <= SNAPSHOT_SUMMARY_MAX_CODE_POINTS) return normalized;

  // 快照只服务列表预览，保留完整摘要给文章详情与翻译资格判断使用。
  return `${codePoints.slice(0, SNAPSHOT_SUMMARY_MAX_CODE_POINTS - 1).join('').trimEnd()}…`;
}

