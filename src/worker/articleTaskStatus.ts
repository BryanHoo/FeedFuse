import type { Pool } from 'pg';
import type { SystemLogCategory } from '../types';
import type { ArticleTaskType } from '../server/repositories/articleTasksRepo';
import {
  upsertTaskFailed,
  upsertTaskRunning,
  upsertTaskSucceeded,
} from '../server/repositories/articleTasksRepo';
import { writeSystemLog } from '../server/logging/systemLogger';
import { mapTaskError } from '../server/tasks/errorMapping';

interface ArticleTaskLifecycleLog {
  category: SystemLogCategory;
  source: string;
  startedMessage: string;
  succeededMessage: string;
  failedMessage: string;
  context?: Record<string, unknown>;
}

export async function runArticleTaskWithStatus<T>(input: {
  pool: Pool;
  articleId: string;
  type: ArticleTaskType;
  jobId: string | null;
  logLifecycle?: ArticleTaskLifecycleLog;
  fn: () => Promise<T>;
}): Promise<T> {
  await upsertTaskRunning(input.pool, {
    articleId: input.articleId,
    type: input.type,
    jobId: input.jobId,
  });
  if (input.logLifecycle) {
    await writeSystemLog(input.pool, {
      level: 'info',
      category: input.logLifecycle.category,
      message: input.logLifecycle.startedMessage,
      source: input.logLifecycle.source,
      context: input.logLifecycle.context,
    });
  }

  try {
    const result = await input.fn();
    await upsertTaskSucceeded(input.pool, {
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
    });
    if (input.logLifecycle) {
      await writeSystemLog(input.pool, {
        level: 'info',
        category: input.logLifecycle.category,
        message: input.logLifecycle.succeededMessage,
        source: input.logLifecycle.source,
        context: input.logLifecycle.context,
      });
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
    if (input.logLifecycle) {
      await writeSystemLog(input.pool, {
        level: 'error',
        category: input.logLifecycle.category,
        message: input.logLifecycle.failedMessage,
        details: mapped.rawErrorMessage ?? mapped.errorMessage,
        source: input.logLifecycle.source,
        context: input.logLifecycle.context,
      });
    }
    throw err;
  }
}
