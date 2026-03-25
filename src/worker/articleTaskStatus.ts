import type { Pool } from 'pg';
import type { ArticleTaskType } from '../server/repositories/articleTasksRepo';
import type { UserOperationActionKey } from '../lib/userOperationCatalog';
import {
  upsertTaskFailed,
  upsertTaskRunning,
  upsertTaskSucceeded,
} from '../server/repositories/articleTasksRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationStartedLog,
  writeUserOperationSucceededLog,
} from '../server/logging/userOperationLogger';
import { mapTaskError } from '../server/tasks/errorMapping';

interface ArticleTaskUserOperation {
  actionKey: UserOperationActionKey;
  source: string;
  context?: Record<string, unknown>;
}

export async function runArticleTaskWithStatus<T>(input: {
  pool: Pool;
  articleId: string;
  type: ArticleTaskType;
  jobId: string | null;
  userOperation?: ArticleTaskUserOperation;
  fn: () => Promise<T>;
}): Promise<T> {
  await upsertTaskRunning(input.pool, {
    articleId: input.articleId,
    type: input.type,
    jobId: input.jobId,
  });
  if (input.userOperation) {
    await writeUserOperationStartedLog(input.pool, input.userOperation);
  }

  try {
    const result = await input.fn();
    await upsertTaskSucceeded(input.pool, {
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
    });
    if (input.userOperation) {
      await writeUserOperationSucceededLog(input.pool, input.userOperation);
    }
    return result;
  } catch (err) {
    const mapped = mapTaskError({ type: input.type, err });
    await upsertTaskFailed(input.pool, {
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
      rawErrorMessage: mapped.rawErrorMessage,
    });
    if (input.userOperation) {
      await writeUserOperationFailedLog(input.pool, {
        ...input.userOperation,
        err,
        details: mapped.rawErrorMessage ?? mapped.errorMessage,
      });
    }
    throw err;
  }
}
