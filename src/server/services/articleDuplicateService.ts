import { createHash } from 'node:crypto';
import {
  listArticleDuplicateCandidates,
  type ArticleDuplicateReason,
  type ArticleRow,
  type DbClient,
} from '../repositories/articlesRepo';

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
  'source',
]);
const MIN_CONTENT_TEXT_LENGTH = 80;
const SIMILARITY_THRESHOLD = 0.85;
const SIMHASH_BITS = 64;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitleValue(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(
    (value ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\p{P}\p{S}]+/gu, ' '),
  );
  return normalized || null;
}

function normalizeLinkValue(value: string | null | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const pathname = normalizeWhitespace(url.pathname).replace(/\/{2,}/g, '/');
    const normalizedPathname =
      pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname || '/';

    const keptParams: Array<[string, string]> = [];
    for (const [key, rawParamValue] of url.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(lowerKey)) {
        continue;
      }

      keptParams.push([key, rawParamValue]);
    }

    keptParams.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue);
      }
      return leftKey.localeCompare(rightKey);
    });

    const normalizedSearch = new URLSearchParams();
    for (const [key, paramValue] of keptParams) {
      normalizedSearch.append(key, paramValue);
    }

    const port =
      (protocol === 'https:' && url.port === '443') || (protocol === 'http:' && url.port === '80')
        ? ''
        : url.port;
    const portSuffix = port ? `:${port}` : '';
    const search = normalizedSearch.toString();

    return `${protocol}//${hostname}${portSuffix}${normalizedPathname}${search ? `?${search}` : ''}`;
  } catch {
    return normalizeWhitespace(value);
  }
}

function buildCandidateText(article: Pick<ArticleRow, 'contentFullHtml' | 'contentHtml' | 'title' | 'summary'>): string {
  const richestContent =
    article.contentFullHtml?.trim() ||
    article.contentHtml?.trim() ||
    [article.title, article.summary].filter(Boolean).join('\n').trim();

  return stripHtml(richestContent);
}

function normalizeContentText(value: string): string {
  const stripped = stripHtml(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ');
  const tokens = stripped
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
  return tokens.join(' ');
}

function resolveNormalizedTitle(article: Pick<ArticleRow, 'normalizedTitle' | 'title'>): string | null {
  return article.normalizedTitle?.trim() || normalizeTitleValue(article.title);
}

function resolveNormalizedLink(article: Pick<ArticleRow, 'normalizedLink' | 'link'>): string | null {
  return article.normalizedLink?.trim() || normalizeLinkValue(article.link);
}

function toFixedScore(value: number): number {
  return Number(value.toFixed(4));
}

function createShingles(tokens: string[], shingleSize = 3): string[] {
  if (tokens.length < shingleSize) {
    return [];
  }

  const shingles: string[] = [];
  for (let index = 0; index <= tokens.length - shingleSize; index += 1) {
    shingles.push(tokens.slice(index, index + shingleSize).join(' '));
  }
  return shingles;
}

// Use a lightweight SimHash so near-duplicate text can still converge to a stable hexadecimal fingerprint.
function createContentFingerprintFromText(text: string): string | null {
  const normalized = normalizeContentText(text);
  if (normalized.length < MIN_CONTENT_TEXT_LENGTH) {
    return null;
  }

  const tokens = normalized.split(' ');
  const shingles = createShingles(tokens);
  if (shingles.length === 0) {
    return null;
  }

  const weights = new Array<number>(SIMHASH_BITS).fill(0);
  for (const shingle of shingles) {
    const hashHex = createHash('sha1').update(shingle).digest('hex').slice(0, 16);
    const hashValue = BigInt(`0x${hashHex}`);
    for (let bit = 0; bit < SIMHASH_BITS; bit += 1) {
      const mask = 1n << BigInt(bit);
      weights[bit] += hashValue & mask ? 1 : -1;
    }
  }

  let fingerprint = 0n;
  for (let bit = 0; bit < SIMHASH_BITS; bit += 1) {
    if (weights[bit] > 0) {
      fingerprint |= 1n << BigInt(bit);
    }
  }

  return fingerprint.toString(16).padStart(16, '0');
}

function countSetBits(value: bigint): number {
  let remaining = value;
  let count = 0;
  while (remaining > 0n) {
    count += Number(remaining & 1n);
    remaining >>= 1n;
  }
  return count;
}

function compareFingerprintSimilarity(left: string, right: string): number {
  const distance = countSetBits(BigInt(`0x${left}`) ^ BigInt(`0x${right}`));
  return 1 - distance / SIMHASH_BITS;
}

function resolveContentFingerprint(article: Pick<ArticleRow, 'contentFingerprint' | 'contentFullHtml' | 'contentHtml' | 'title' | 'summary'>): string | null {
  return article.contentFingerprint?.trim() || createContentFingerprintFromText(buildCandidateText(article));
}

function buildResult(input: {
  matched: boolean;
  duplicateOfArticleId: string | null;
  duplicateReason: ArticleDuplicateReason | null;
  duplicateScore: number | null;
  normalizedTitle: string | null;
  normalizedLink: string | null;
  contentFingerprint: string | null;
}): ArticleDuplicateMatchResult {
  return input;
}

export interface ArticleDuplicateMatchResult {
  matched: boolean;
  duplicateOfArticleId: string | null;
  duplicateReason: ArticleDuplicateReason | null;
  duplicateScore: number | null;
  normalizedTitle: string | null;
  normalizedLink: string | null;
  contentFingerprint: string | null;
}

export function findDuplicateCandidate(input: {
  article: ArticleRow;
  candidates: ArticleRow[];
}): ArticleDuplicateMatchResult {
  const normalizedTitle = resolveNormalizedTitle(input.article);
  const normalizedLink = resolveNormalizedLink(input.article);

  for (const candidate of input.candidates) {
    if (!normalizedLink) {
      break;
    }

    if (resolveNormalizedLink(candidate) === normalizedLink) {
      return buildResult({
        matched: true,
        duplicateOfArticleId: candidate.id,
        duplicateReason: 'same_normalized_url',
        duplicateScore: 1,
        normalizedTitle,
        normalizedLink,
        contentFingerprint: null,
      });
    }
  }

  for (const candidate of input.candidates) {
    if (!normalizedTitle) {
      break;
    }

    if (resolveNormalizedTitle(candidate) === normalizedTitle) {
      return buildResult({
        matched: true,
        duplicateOfArticleId: candidate.id,
        duplicateReason: 'same_title',
        duplicateScore: 1,
        normalizedTitle,
        normalizedLink,
        contentFingerprint: null,
      });
    }
  }

  const contentFingerprint = resolveContentFingerprint(input.article);
  if (!contentFingerprint) {
    return buildResult({
      matched: false,
      duplicateOfArticleId: null,
      duplicateReason: null,
      duplicateScore: null,
      normalizedTitle,
      normalizedLink,
      contentFingerprint: null,
    });
  }

  for (const candidate of input.candidates) {
    const candidateFingerprint = resolveContentFingerprint(candidate);
    if (!candidateFingerprint) {
      continue;
    }

    const similarity = compareFingerprintSimilarity(contentFingerprint, candidateFingerprint);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return buildResult({
        matched: true,
        duplicateOfArticleId: candidate.id,
        duplicateReason: 'similar_content',
        duplicateScore: toFixedScore(similarity),
        normalizedTitle,
        normalizedLink,
        contentFingerprint,
      });
    }
  }

  return buildResult({
    matched: false,
    duplicateOfArticleId: null,
    duplicateReason: null,
    duplicateScore: null,
    normalizedTitle,
    normalizedLink,
    contentFingerprint,
  });
}

export async function evaluateArticleDuplicate(input: {
  pool: DbClient;
  article: ArticleRow;
}): Promise<ArticleDuplicateMatchResult> {
  const candidates = await listArticleDuplicateCandidates(input.pool, {
    articleId: input.article.id,
    publishedAt: input.article.publishedAt,
    fetchedAt: input.article.fetchedAt,
  });
  return findDuplicateCandidate({
    article: input.article,
    candidates,
  });
}
