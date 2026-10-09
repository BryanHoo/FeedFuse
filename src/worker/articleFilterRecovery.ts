import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import {
  getPendingArticleFilterForUpdate,
  listPendingArticleFilterIds,
} from '@/server/domains/articles/repositories/articleFilterRecoveryRepo';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_ARTICLE_FILTER } from '@/server/infra/queue/jobs';
import { createQueueTransactionDb } from '@/server/infra/queue/transactionDb';
import type { ArticleFilterJobData } from '@/worker/articleFilterWorker';

const defaultDeps = { getPendingArticleFilterForUpdate, listPendingArticleFilterIds, getUiSettings };

export async function runArticleFilterRecovery(input: {
  pool: Pool;
  boss: Pick<PgBoss, 'send' | 'findJobs'>;
  userId: string;
  deps?: Partial<typeof defaultDeps>;
}): Promise<number> {
  const deps = { ...defaultDeps, ...input.deps };
  const settings = normalizePersistedSettings(await deps.getUiSettings(input.pool, input.userId));
  let afterId: string | null = null;
  let recovered = 0;

  while (true) {
    // 按主键分页扫描全部 pending；已有任务的文章不能占住首页、饿死后面的遗漏文章。
    const ids = await deps.listPendingArticleFilterIds(input.pool, { userId: input.userId, afterId, limit: 100 });
    if (ids.length === 0) return recovered;
    afterId = ids[ids.length - 1];

    for (const articleId of ids) {
      const client = await input.pool.connect();
      try {
        await client.query('begin');
        // 锁定文章并重新检查状态；并发扫描和过滤结果写回必须在同一行上串行化。
        const candidate = await deps.getPendingArticleFilterForUpdate(client, articleId, input.userId);
        if (!candidate) {
          await client.query('commit');
          continue;
        }
        const db = createQueueTransactionDb(client);
        // queued=true 不包含 active，因此查询所有匹配任务后显式排除排队、重试和执行中的任务。
        const existing = await input.boss.findJobs(JOB_ARTICLE_FILTER, {
          data: { userId: input.userId, articleId }, db,
        });
        if (existing.some((job) => job.state === 'created' || job.state === 'retry' || job.state === 'active')) {
          await client.query('commit');
          continue;
        }
        const { fullTextOnFetchEnabled, aiSummaryOnFetchEnabled, bodyTranslateOnFetchEnabled, titleTranslateEnabled } = candidate;
        const job: ArticleFilterJobData = {
          userId: input.userId, articleId,
          articleFilter: settings.rss.articleFilter,
          feed: { fullTextOnFetchEnabled, aiSummaryOnFetchEnabled, bodyTranslateOnFetchEnabled, titleTranslateEnabled },
        };
        const jobId = await input.boss.send(JOB_ARTICLE_FILTER, job, {
          ...getQueueSendOptions(JOB_ARTICLE_FILTER, { userId: input.userId, articleId }), db,
        });
        await client.query('commit');
        // 时间窗去重返回 null 时保留 pending，后续扫描仍会重试，不能误报已恢复。
        if (jobId) recovered += 1;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  }
}
