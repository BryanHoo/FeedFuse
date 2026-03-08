import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { getArticleById } from '../../../../../server/repositories/articlesRepo';
import { upsertTaskQueued } from '../../../../../server/repositories/articleTasksRepo';
import { getFeedFullTextOnOpenEnabled } from '../../../../../server/repositories/feedsRepo';
import { getQueueSendOptions } from '../../../../../server/queue/contracts';
import { enqueueWithResult } from '../../../../../server/queue/queue';
import { JOB_ARTICLE_FULLTEXT_FETCH } from '../../../../../server/queue/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function rssContentLooksFull(contentHtml: string | null, summary: string | null): boolean {
  if (!contentHtml) return false;

  const text = htmlToText(contentHtml);
  if (!text) return false;

  if (/(read more|continue reading)/i.test(text)) return false;
  if (/阅读全文|继续阅读|阅读更多|更多内容/i.test(text)) return false;

  const textLen = text.length;
  const paragraphCount = (contentHtml.match(/<p[\s>]/gi) ?? []).length;

  const summaryText = typeof summary === 'string' ? normalizeWhitespace(summary) : '';
  const summaryLen = summaryText.length;

  if (textLen >= 2000) return true;
  if (paragraphCount >= 5 && textLen >= 800) return true;
  if (summaryLen > 0 && textLen >= Math.max(1200, summaryLen * 4)) return true;

  return false;
}

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const json = await request.json().catch(() => null);
    const force = Boolean(isRecord(json) && json.force === true);

    const articleId = paramsParsed.data.id;
    const pool = getPool();
    const article = await getArticleById(pool, articleId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(pool, article.feedId);
    if (!force && fullTextOnOpenEnabled !== true) {
      return ok({ enqueued: false });
    }

    if (!article.link) return ok({ enqueued: false });
    if (article.contentFullHtml) return ok({ enqueued: false });
    if (rssContentLooksFull(article.contentHtml, article.summary)) return ok({ enqueued: false });

    const enqueueResult = await enqueueWithResult(
      JOB_ARTICLE_FULLTEXT_FETCH,
      { articleId },
      getQueueSendOptions(JOB_ARTICLE_FULLTEXT_FETCH, { articleId }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false });
    }

    await upsertTaskQueued(pool, {
      articleId,
      type: 'fulltext',
      jobId: enqueueResult.jobId,
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId });
  } catch (err) {
    return fail(err);
  }
}
