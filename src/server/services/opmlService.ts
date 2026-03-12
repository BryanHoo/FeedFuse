import type { Pool } from 'pg';
import { ValidationError } from '../http/errors';
import {
  buildOpmlDocument,
  OpmlDocumentError,
  parseOpmlDocument,
  type ParsedOpmlInvalidItem,
} from '../opml/opmlDocument';
import { listCategories } from '../repositories/categoriesRepo';
import { listFeeds } from '../repositories/feedsRepo';
import { deriveFeedIconUrl } from '../rss/deriveFeedIconUrl';
import { createFeedWithCategoryResolution } from './feedCategoryLifecycleService';

export interface OpmlImportResult {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdCategoryCount: number;
  duplicates: Array<{
    title: string;
    xmlUrl: string;
    reason: 'duplicate_in_file' | 'duplicate_in_db';
  }>;
  invalidItems: ParsedOpmlInvalidItem[];
}

function normalizeCategoryNameForTracking(name: string | null): string | null {
  const normalized = name?.trim() ?? '';
  if (!normalized || normalized === '未分类') {
    return null;
  }

  return normalized.toLowerCase();
}

function normalizeComparableUrl(url: string): string {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

export async function importOpml(
  pool: Pool,
  input: { content: string },
): Promise<OpmlImportResult> {
  let parsed;

  try {
    parsed = parseOpmlDocument(input.content);
  } catch (error) {
    if (error instanceof OpmlDocumentError) {
      throw new ValidationError('OPML 文件格式无效', { content: 'invalid_opml' });
    }
    throw error;
  }

  const [existingFeeds, existingCategories] = await Promise.all([listFeeds(pool), listCategories(pool)]);
  const existingUrls = new Set(existingFeeds.map((feed) => normalizeComparableUrl(feed.url)));
  const knownCategoryNames = new Set(
    existingCategories
      .map((category) => normalizeCategoryNameForTracking(category.name))
      .filter((name): name is string => name !== null),
  );
  const createdCategoryNames = new Set<string>();
  const duplicates: OpmlImportResult['duplicates'] = parsed.duplicateItems.map((item) => ({
    title: item.title,
    xmlUrl: item.xmlUrl,
    reason: item.reason,
  }));

  let importedCount = 0;

  for (const entry of parsed.entries) {
    if (existingUrls.has(entry.xmlUrl)) {
      duplicates.push({
        title: entry.title,
        xmlUrl: entry.xmlUrl,
        reason: 'duplicate_in_db',
      });
      continue;
    }

    await createFeedWithCategoryResolution(pool, {
      title: entry.title,
      url: entry.xmlUrl,
      siteUrl: entry.siteUrl,
      iconUrl: deriveFeedIconUrl(entry.siteUrl),
      categoryName: entry.category,
    });

    importedCount += 1;
    existingUrls.add(entry.xmlUrl);

    const normalizedCategoryName = normalizeCategoryNameForTracking(entry.category);
    if (normalizedCategoryName && !knownCategoryNames.has(normalizedCategoryName)) {
      knownCategoryNames.add(normalizedCategoryName);
      createdCategoryNames.add(normalizedCategoryName);
    }
  }

  return {
    importedCount,
    duplicateCount: duplicates.length,
    invalidCount: parsed.invalidItems.length,
    createdCategoryCount: createdCategoryNames.size,
    duplicates,
    invalidItems: parsed.invalidItems,
  };
}

export async function exportOpml(pool: Pool): Promise<{ xml: string; fileName: string }> {
  const [categories, feeds] = await Promise.all([listCategories(pool), listFeeds(pool)]);

  return {
    xml: buildOpmlDocument({
      title: 'FeedFuse Subscriptions',
      categories,
      feeds,
    }),
    fileName: 'feedfuse-subscriptions.opml',
  };
}
