import type { Pool } from 'pg';
import type { ArticleTaskType } from '@/server/domains/articles/repositories/articleTasksRepo';
import type { UserOperationActionKey } from '@/lib/userOperationCatalog';
import {
  upsertTaskFailed,
  upsertTaskRunning,
  upsertTaskSucceeded,
} from '@/server/domains/articles/repositories/articleTasksRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationStartedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { mapTaskError } from '@/server/domains/settings/tasks/errorMapping';

interface ArticleTaskUserOperation {
  userId?: string | null;
  actionKey: UserOperationActionKey;
  source: string;
  context?: Record<string, unknown>;
}

export async function runArticleTaskWithStatus<T>(input: {
  pool: Pool;
  userId?: string | null;
  articleId: string;
  type: ArticleTaskType;
  jobId: string | null;
  allowNewJob?: boolean;
  userOperation?: ArticleTaskUserOperation;
  fn: () => Promise<T>;
}): Promise<T | undefined> {
  const claimed = await upsertTaskRunning(input.pool, {
    userId: input.userId,
    articleId: input.articleId,
    type: input.type,
    jobId: input.jobId,
    ...(input.allowNewJob !== undefined ? { allowNewJob: input.allowNewJob } : {}),
  });
  // 条件更新未命中时，任务已被重试任务替代或已经终结；不能执行旧任务，也不能误报启动。
  if (claimed === false) return;
  if (input.userOperation) {
    await writeUserOperationStartedLog(input.pool, {
      ...input.userOperation,
      userId: input.userId ?? input.userOperation.userId,
    });
  }

  try {
    const result = await input.fn();
    const succeeded = await upsertTaskSucceeded(input.pool, {
      userId: input.userId,
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
    });
    if (succeeded !== false && input.userOperation) {
      await writeUserOperationSucceededLog(input.pool, {
        ...input.userOperation,
        userId: input.userId ?? input.userOperation.userId,
      });
    }
    return result;
  } catch (err) {
    const mapped = mapTaskError({ type: input.type, err });
    const failed = await upsertTaskFailed(input.pool, {
      userId: input.userId,
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
      rawErrorMessage: mapped.rawErrorMessage,
    });
    if (failed !== false && input.userOperation) {
      await writeUserOperationFailedLog(input.pool, {
        ...input.userOperation,
        userId: input.userId ?? input.userOperation.userId,
        err,
        details: mapped.rawErrorMessage ?? mapped.errorMessage,
      });
    }
    throw err;
  }
}
