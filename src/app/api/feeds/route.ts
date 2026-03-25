import { z } from 'zod';
import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { numericIdSchema } from '../../../server/http/idSchemas';
import { ConflictError, ValidationError } from '../../../server/http/errors';
import { listFeeds } from '../../../server/repositories/feedsRepo';
import { deriveFeedIconUrl } from '../../../server/rss/deriveFeedIconUrl';
import { isSafeExternalUrl } from '../../../server/rss/ssrfGuard';
import { createFeedWithCategoryResolution } from '../../../server/services/feedCategoryLifecycleService';
import { normalizeFeedAutoTriggerFlags } from '../../../lib/feedAutoTriggerPolicy';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const feedUrlSafetyOptions = { allowUnresolvedHostname: true } as const;

const categoryInputShape = {
  categoryId: numericIdSchema.nullable().optional(),
  categoryName: z.string().trim().min(1).nullable().optional(),
};

const createFeedBodySchema = z
  .object({
    title: z.string().trim().min(1),
    url: z.string().trim().min(1).url(),
    siteUrl: z.string().trim().url().nullable().optional(),
    ...categoryInputShape,
    fullTextOnOpenEnabled: z.boolean().optional(),
    fullTextOnFetchEnabled: z.boolean().optional(),
    aiSummaryOnOpenEnabled: z.boolean().optional(),
    aiSummaryOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnOpenEnabled: z.boolean().optional(),
    titleTranslateEnabled: z.boolean().optional(),
    bodyTranslateEnabled: z.boolean().optional(),
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    path: ['categoryName'],
    message: 'categoryId and categoryName are mutually exclusive',
  });

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

function isForeignKeyViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23503' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

const operationSource = 'app/api/feeds';

async function writeFeedCreateFailure(err: unknown) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'feed.create',
    source: operationSource,
    err,
  });
}

export async function GET() {
  try {
    const pool = getPool();
    const feeds = await listFeeds(pool);

    const { rows } = await pool.query<{ feedId: string; unreadCount: number }>(`
      select feed_id as "feedId", count(*)::int as "unreadCount"
      from articles
      where is_read = false and filter_status = any('{passed,error}'::text[])
      group by feed_id
    `);

    const unreadByFeedId = new Map<string, number>();
    for (const row of rows) unreadByFeedId.set(row.feedId, row.unreadCount);

    const data = feeds.map((feed) => ({
      ...feed,
      unreadCount: unreadByFeedId.get(feed.id) ?? 0,
    }));

    return ok(data);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = createFeedBodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeFeedCreateFailure(error);
      return fail(error);
    }
    if (!(await isSafeExternalUrl(parsed.data.url, feedUrlSafetyOptions))) {
      const error = new ValidationError('Invalid request body', { url: 'Unsafe URL' });
      await writeFeedCreateFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const siteUrl = parsed.data.siteUrl ?? null;
    const created = await createFeedWithCategoryResolution(pool, normalizeFeedAutoTriggerFlags({
      ...parsed.data,
      siteUrl,
      iconUrl: deriveFeedIconUrl(siteUrl),
      fullTextOnOpenEnabled: parsed.data.fullTextOnOpenEnabled ?? false,
      fullTextOnFetchEnabled: parsed.data.fullTextOnFetchEnabled ?? false,
      aiSummaryOnOpenEnabled: parsed.data.aiSummaryOnOpenEnabled ?? false,
      aiSummaryOnFetchEnabled: parsed.data.aiSummaryOnFetchEnabled ?? false,
      bodyTranslateOnFetchEnabled: parsed.data.bodyTranslateOnFetchEnabled ?? false,
      bodyTranslateOnOpenEnabled: parsed.data.bodyTranslateOnOpenEnabled ?? false,
      titleTranslateEnabled: parsed.data.titleTranslateEnabled ?? false,
      bodyTranslateEnabled: parsed.data.bodyTranslateEnabled ?? false,
    }));
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'feed.create',
      source: operationSource,
      context: { feedId: created.id },
    });

    return ok({ ...created, unreadCount: 0 });
  } catch (err) {
    if (isUniqueViolation(err, 'feeds_url_unique')) {
      const error = new ConflictError('Feed already exists', { url: 'duplicate' });
      await writeFeedCreateFailure(error);
      return fail(error);
    }
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      const error = new ValidationError('Invalid request body', { categoryId: 'not_found' });
      await writeFeedCreateFailure(error);
      return fail(error);
    }
    await writeFeedCreateFailure(err);
    return fail(err);
  }
}
