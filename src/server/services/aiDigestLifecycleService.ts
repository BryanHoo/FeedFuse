import type { Pool } from 'pg';
import {
  createCategory,
  deleteCategory,
  findCategoryByNormalizedName,
  getNextCategoryPosition,
} from '../repositories/categoriesRepo';
import {
  countFeedsByCategoryId,
  createAiDigestFeed,
  getFeedCategoryAssignment,
  type FeedRow,
  updateFeed,
} from '../repositories/feedsRepo';
import {
  createAiDigestConfig,
  getAiDigestConfigByFeedId,
  updateAiDigestConfig,
} from '../repositories/aiDigestRepo';

type CategoryResolutionInput = {
  categoryId?: string | null;
  categoryName?: string | null;
};

function normalizeCategoryName(name: string | null | undefined): string | null {
  const normalized = name?.trim() ?? '';
  if (!normalized || normalized === '未分类') return null;
  return normalized;
}

async function resolveCategoryId(
  client: { query: Pool['query'] },
  input: CategoryResolutionInput,
): Promise<string | null> {
  if (typeof input.categoryId !== 'undefined') {
    return input.categoryId ?? null;
  }

  const normalizedName = normalizeCategoryName(input.categoryName);
  if (!normalizedName) return null;

  const existing = await findCategoryByNormalizedName(client as never, normalizedName);
  if (existing) return existing.id;

  const position = await getNextCategoryPosition(client as never);
  const created = await createCategory(client as never, { name: normalizedName, position });
  return created.id;
}

async function cleanupCategoryIfEmpty(
  client: { query: Pool['query'] },
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return;

  const remainingCount = await countFeedsByCategoryId(client as never, categoryId);
  if (remainingCount === 0) {
    await deleteCategory(client as never, categoryId);
  }
}

export async function createAiDigestWithCategoryResolution(
  pool: Pool,
  input: {
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
  },
) {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const categoryId = await resolveCategoryId(client as never, input);

    const createdFeed = await createAiDigestFeed(client as never, {
      title: input.title,
      categoryId,
    });

    await createAiDigestConfig(client as never, {
      feedId: createdFeed.id,
      prompt: input.prompt,
      intervalMinutes: input.intervalMinutes,
      topN: 10,
      selectedFeedIds: input.selectedFeedIds,
      lastWindowEndAt: new Date().toISOString(),
    });

    await client.query('commit');
    return createdFeed;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAiDigestWithCategoryResolution(
  pool: Pool,
  input: {
    feedId: string;
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
  },
): Promise<FeedRow | null> {
  const client = await pool.connect();
  try {
    await client.query('begin');

    const [existingFeed, existingConfig] = await Promise.all([
      getFeedCategoryAssignment(client as never, input.feedId),
      getAiDigestConfigByFeedId(client as never, input.feedId),
    ]);
    if (!existingFeed || !existingConfig) {
      await client.query('commit');
      return null;
    }

    const nextCategoryId = await resolveCategoryId(client as never, input);

    // 编辑 AI 解读时同时更新 feeds 与 ai_digest_configs，确保同事务一致。
    const updatedFeed = await updateFeed(client as never, input.feedId, {
      title: input.title,
      categoryId: nextCategoryId,
    });
    if (!updatedFeed) {
      await client.query('commit');
      return null;
    }

    const updatedConfig = await updateAiDigestConfig(client as never, input.feedId, {
      prompt: input.prompt,
      intervalMinutes: input.intervalMinutes,
      selectedFeedIds: input.selectedFeedIds,
    });
    if (!updatedConfig) {
      await client.query('rollback');
      return null;
    }

    if (existingFeed.categoryId !== updatedFeed.categoryId) {
      await cleanupCategoryIfEmpty(client as never, existingFeed.categoryId);
    }

    await client.query('commit');
    return updatedFeed;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
