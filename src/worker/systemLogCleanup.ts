import { deleteExpiredAiSummaryEvents } from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import { deleteExpiredTranslationEvents } from '@/server/domains/articles/repositories/articleTranslationRepo';
import type { Pool, PoolClient } from 'pg';
import { defaultPersistedSettings, normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { listUsers } from '@/server/domains/auth/repositories/usersRepo';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { deleteExpiredSystemLogs } from '@/server/domains/settings/repositories/systemLogsRepo';

type Queryable = Pool | PoolClient;

type SystemLogCleanupDeps = {
  deleteExpiredAiSummaryEvents: typeof deleteExpiredAiSummaryEvents;
  deleteExpiredTranslationEvents: typeof deleteExpiredTranslationEvents;
  listUsers: typeof listUsers;
  getUiSettings: typeof getUiSettings;
  deleteExpiredSystemLogs: typeof deleteExpiredSystemLogs;
};

const defaultDeps: SystemLogCleanupDeps = {
  deleteExpiredAiSummaryEvents,
  deleteExpiredTranslationEvents,
  listUsers,
  getUiSettings,
  deleteExpiredSystemLogs,
};

export async function runSystemLogCleanup(input: {
  pool: Queryable;
  deps?: Partial<SystemLogCleanupDeps>;
}): Promise<number> {
  const deps = { ...defaultDeps, ...(input.deps ?? {}) };
  let deletedCount = 0;

  // 无归属日志使用产品默认保留期，避免错误套用某个用户的个人设置。
  deletedCount += await deps.deleteExpiredSystemLogs(input.pool, {
    retentionDays: defaultPersistedSettings.logging.retentionDays,
    userId: null,
  });

  const users = await deps.listUsers(input.pool);
  for (const user of users) {
    const logging = normalizePersistedSettings(
      await deps.getUiSettings(input.pool, user.id),
    ).logging;
    deletedCount += await deps.deleteExpiredSystemLogs(input.pool, {
      retentionDays: logging.retentionDays,
      userId: user.id,
    });
    // 复用启动时及每小时的维护任务；流事件保留期独立于用户的日志设置。
    await deps.deleteExpiredAiSummaryEvents(input.pool, { userId: user.id });
    await deps.deleteExpiredTranslationEvents(input.pool, { userId: user.id });
  }

  return deletedCount;
}
