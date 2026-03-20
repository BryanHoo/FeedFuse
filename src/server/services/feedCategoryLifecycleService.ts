import type { Pool, PoolClient } from 'pg';
import {
  createCategory,
  deleteCategory,
  findCategoryByNormalizedName,
  getNextCategoryPosition,
} from '../repositories/categoriesRepo';
import {
  countFeedsByCategoryId,
  createFeed,
  deleteFeed,
  getFeedCategoryAssignment,
  type FeedRow,
  updateFeed,
} from '../repositories/feedsRepo';

interface CategoryResolutionInput {
  categoryId?: string | null;
  categoryName?: string | null;
}

export interface CreateFeedWithCategoryInput extends CategoryResolutionInput {
  title: string;
  url: string;
  siteUrl?: string | null;
  iconUrl?: string | null;
  enabled?: boolean;
  fullTextOnOpenEnabled?: boolean;
  fullTextOnFetchEnabled?: boolean;
  aiSummaryOnOpenEnabled?: boolean;
  aiSummaryOnFetchEnabled?: boolean;
  bodyTranslateOnFetchEnabled?: boolean;
  bodyTranslateOnOpenEnabled?: boolean;
  titleTranslateEnabled?: boolean;
  bodyTranslateEnabled?: boolean;
  articleListDisplayMode?: 'card' | 'list';
  fetchIntervalMinutes?: number;
}

export interface UpdateFeedWithCategoryInput extends CategoryResolutionInput {
  title?: string;
  url?: string;
  siteUrl?: string | null;
  iconUrl?: string | null;
  enabled?: boolean;
  fullTextOnOpenEnabled?: boolean;
  fullTextOnFetchEnabled?: boolean;
  aiSummaryOnOpenEnabled?: boolean;
  aiSummaryOnFetchEnabled?: boolean;
  bodyTranslateOnFetchEnabled?: boolean;
  bodyTranslateOnOpenEnabled?: boolean;
  titleTranslateEnabled?: boolean;
  bodyTranslateEnabled?: boolean;
  articleListDisplayMode?: 'card' | 'list';
  fetchIntervalMinutes?: number;
}

function hasCategoryInput(input: CategoryResolutionInput): boolean {
  return typeof input.categoryId !== 'undefined' || typeof input.categoryName !== 'undefined';
}

function normalizeCategoryName(name: string | null | undefined): string | null {
  const normalized = name?.trim() ?? '';
  if (!normalized || normalized === '未分类') return null;
  return normalized;
}

async function resolveCategoryId(
  client: PoolClient,
  input: CategoryResolutionInput,
): Promise<string | null> {
  if (typeof input.categoryId !== 'undefined') {
    return input.categoryId ?? null;
  }

  const normalizedName = normalizeCategoryName(input.categoryName);
  if (!normalizedName) return null;

  const existing = await findCategoryByNormalizedName(client, normalizedName);
  if (existing) return existing.id;

  const position = await getNextCategoryPosition(client);
  const created = await createCategory(client, { name: normalizedName, position });
  return created.id;
}

async function cleanupCategoryIfEmpty(
  client: PoolClient,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return;

  const remainingCount = await countFeedsByCategoryId(client, categoryId);
  if (remainingCount === 0) {
    await deleteCategory(client, categoryId);
  }
}

export async function createFeedWithCategoryResolution(
  pool: Pool,
  input: CreateFeedWithCategoryInput,
): Promise<FeedRow> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const resolvedCategoryId = await resolveCategoryId(client, input);
    const created = await createFeed(client, {
      ...input,
      categoryId: resolvedCategoryId,
    });

    await client.query('commit');
    return created;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateFeedWithCategoryResolution(
  pool: Pool,
  id: string,
  input: UpdateFeedWithCategoryInput,
): Promise<FeedRow | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const existing = await getFeedCategoryAssignment(client, id);
    if (!existing) {
      await client.query('commit');
      return null;
    }

    const nextInput = { ...input } as UpdateFeedWithCategoryInput & {
      categoryId?: string | null;
    };

    if (hasCategoryInput(input)) {
      nextInput.categoryId = await resolveCategoryId(client, input);
    }

    const updated = await updateFeed(client, id, nextInput);
    if (!updated) {
      await client.query('commit');
      return null;
    }

    if (existing.categoryId !== updated.categoryId) {
      await cleanupCategoryIfEmpty(client, existing.categoryId);
    }

    await client.query('commit');
    return updated;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteFeedAndCleanupCategory(
  pool: Pool,
  id: string,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const existing = await getFeedCategoryAssignment(client, id);
    if (!existing) {
      await client.query('commit');
      return false;
    }

    const deleted = await deleteFeed(client, id);
    if (!deleted) {
      await client.query('commit');
      return false;
    }

    await cleanupCategoryIfEmpty(client, existing.categoryId);
    await client.query('commit');
    return true;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
