import type { Pool } from 'pg';
import type { ArticleTaskType } from '../server/repositories/articleTasksRepo';
import {
  upsertTaskFailed,
  upsertTaskRunning,
  upsertTaskSucceeded,
} from '../server/repositories/articleTasksRepo';
import { mapTaskError } from '../server/tasks/errorMapping';

export async function runArticleTaskWithStatus<T>(input: {
  pool: Pool;
  articleId: string;
  type: ArticleTaskType;
  jobId: string | null;
  fn: () => Promise<T>;
}): Promise<T> {
  await upsertTaskRunning(input.pool, {
    articleId: input.articleId,
    type: input.type,
    jobId: input.jobId,
  });

  try {
    const result = await input.fn();
    await upsertTaskSucceeded(input.pool, {
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
    });
    return result;
  } catch (err) {
    const mapped = mapTaskError({ type: input.type, err });
    await upsertTaskFailed(input.pool, {
      articleId: input.articleId,
      type: input.type,
      jobId: input.jobId,
      errorCode: mapped.errorCode,
      errorMessage: mapped.errorMessage,
    });
    throw err;
  }
}

