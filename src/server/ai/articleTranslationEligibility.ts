const STRONG_SIMPLIFIED_LANGUAGE_TAGS = new Set(['zh-cn', 'zh-hans', 'zh-sg', 'zh-my']);
const STRONG_TRADITIONAL_LANGUAGE_TAGS = new Set(['zh-tw', 'zh-hk', 'zh-mo', 'zh-hant']);
const MIN_HEURISTIC_SOURCE_LENGTH = 8;

export interface ArticleBodyTranslationEligibilityInput {
  sourceLanguage: string | null;
  contentHtml: string | null;
  contentFullHtml: string | null;
  summary: string | null;
}

export interface ArticleBodyTranslationEligibility {
  bodyTranslationEligible: boolean;
  bodyTranslationBlockedReason: 'source_is_simplified_chinese' | null;
  source: 'metadata' | 'heuristic';
}

function normalizeSourceLanguage(sourceLanguage: string | null): string | null {
  const normalized = sourceLanguage?.trim().toLowerCase() ?? null;
  return normalized && normalized.length > 0 ? normalized : null;
}

function toVisiblePlainText(input: ArticleBodyTranslationEligibilityInput): string {
  const source = input.contentFullHtml ?? input.contentHtml ?? input.summary ?? '';

  return source
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function evaluateArticleBodyTranslationEligibility(
  input: ArticleBodyTranslationEligibilityInput,
): ArticleBodyTranslationEligibility {
  const normalizedSourceLanguage = normalizeSourceLanguage(input.sourceLanguage);

  if (
    normalizedSourceLanguage &&
    STRONG_SIMPLIFIED_LANGUAGE_TAGS.has(normalizedSourceLanguage)
  ) {
    return {
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      source: 'metadata',
    };
  }

  if (
    normalizedSourceLanguage &&
    STRONG_TRADITIONAL_LANGUAGE_TAGS.has(normalizedSourceLanguage)
  ) {
    return {
      bodyTranslationEligible: true,
      bodyTranslationBlockedReason: null,
      source: 'metadata',
    };
  }

  const plain = toVisiblePlainText(input);
  const hasStrongSimplifiedSignal = /这|里|后|发|级|关|经|应|两|为/.test(plain);
  const hasTraditionalSignal = /這|裡|後|發|級|關|經|應|兩|為/.test(plain);
  const hasJapaneseKana = /[ぁ-んァ-ヶ]/.test(plain);

  if (
    plain.length >= MIN_HEURISTIC_SOURCE_LENGTH &&
    hasStrongSimplifiedSignal &&
    !hasTraditionalSignal &&
    !hasJapaneseKana
  ) {
    return {
      bodyTranslationEligible: false,
      bodyTranslationBlockedReason: 'source_is_simplified_chinese',
      source: 'heuristic',
    };
  }

  return {
    bodyTranslationEligible: true,
    bodyTranslationBlockedReason: null,
    source: 'heuristic',
  };
}
