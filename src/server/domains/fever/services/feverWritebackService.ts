import type { Pool } from 'pg';
import { ValidationError } from '@/server/infra/http/errors';
import {
  setArticleRead,
  setArticleStarred,
} from '@/server/domains/articles/repositories/articlesRepo';
import { getFeverAccountById } from '@/server/domains/fever/repositories/feverAccountsRepo';
import {
  getFeverItemMappingByLocalArticleId,
  hasAnyFeverItemMappingByLocalArticleId,
} from '@/server/domains/fever/repositories/feverMappingsRepo';
import { createFeverClient, type FeverClient } from '@/server/integrations/fever/feverClient';
import { normalizeUserId } from '@/server/domains/users/userScope';

export async function createClientForAccount(
  pool: Pool,
  accountId: string,
  userId?: string,
): Promise<FeverClient> {
  const account = await getFeverAccountById(pool, accountId, userId);
  if (!account) {
    throw new Error(`Fever account ${accountId} not found`);
  }

  return createFeverClient({
    baseUrl: account.baseUrl,
    username: account.username,
    apiKey: account.apiKey,
  });
}

export async function updateArticleStateWithWriteback(
  pool: Pool,
  input: {
    articleId: string;
    isRead?: boolean;
    isStarred?: boolean;
    requireRemoteWriteback?: boolean;
    userId?: string;
  },
): Promise<void> {
  const userId = normalizeUserId(input.userId);
  const mapping = await getFeverItemMappingByLocalArticleId(pool, input.articleId, userId);

  if (!mapping) {
    const hasFeverMapping = input.requireRemoteWriteback
      ? await hasAnyFeverItemMappingByLocalArticleId(pool, input.articleId, userId)
      : false;
    if (hasFeverMapping) {
      throw new ValidationError('Invalid request body', {
        articleId: 'Fever 来源已失效或账号已停用，无法写回远端状态',
      });
    }
    if (typeof input.isRead !== 'undefined') {
      await setArticleRead(pool, input.articleId, input.isRead, userId);
    }
    if (typeof input.isStarred !== 'undefined') {
      await setArticleStarred(pool, input.articleId, input.isStarred, userId);
    }
    return;
  }

  const client = await createClientForAccount(pool, mapping.feverAccountId, userId);

  if (typeof input.isRead !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isRead ? 'read' : 'unread',
    });
    await setArticleRead(pool, input.articleId, input.isRead, userId);
  }

  if (typeof input.isStarred !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isStarred ? 'saved' : 'unsaved',
    });
    await setArticleStarred(pool, input.articleId, input.isStarred, userId);
  }
}
