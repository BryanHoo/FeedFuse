import { z } from 'zod';
import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { ConflictError, ValidationError } from '../../../server/http/errors';
import { createFeed, listFeeds } from '../../../server/repositories/feedsRepo';
import { deriveFeedIconUrl } from '../../../server/rss/deriveFeedIconUrl';
import { isSafeExternalUrl } from '../../../server/rss/ssrfGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createFeedBodySchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().trim().min(1).url(),
  siteUrl: z.string().trim().url().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  fullTextOnOpenEnabled: z.boolean().optional(),
  aiSummaryOnOpenEnabled: z.boolean().optional(),
  titleTranslateEnabled: z.boolean().optional(),
  bodyTranslateEnabled: z.boolean().optional(),
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

export async function GET() {
  try {
    const pool = getPool();
    const feeds = await listFeeds(pool);

    const { rows } = await pool.query<{ feedId: string; unreadCount: number }>(`
      select feed_id as "feedId", count(*)::int as "unreadCount"
      from articles
      where is_read = false
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
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }
    if (!(await isSafeExternalUrl(parsed.data.url))) {
      return fail(new ValidationError('Invalid request body', { url: 'Unsafe URL' }));
    }

    const pool = getPool();
    const siteUrl = parsed.data.siteUrl ?? null;
    const created = await createFeed(pool, {
      title: parsed.data.title,
      url: parsed.data.url,
      siteUrl,
      iconUrl: deriveFeedIconUrl(siteUrl),
      categoryId: parsed.data.categoryId ?? null,
      fullTextOnOpenEnabled: parsed.data.fullTextOnOpenEnabled ?? false,
      aiSummaryOnOpenEnabled: parsed.data.aiSummaryOnOpenEnabled ?? false,
      titleTranslateEnabled: parsed.data.titleTranslateEnabled ?? false,
      bodyTranslateEnabled: parsed.data.bodyTranslateEnabled ?? false,
    });

    return ok({ ...created, unreadCount: 0 });
  } catch (err) {
    if (isUniqueViolation(err, 'feeds_url_unique')) {
      return fail(new ConflictError('Feed already exists', { url: 'duplicate' }));
    }
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      return fail(new ValidationError('Invalid request body', { categoryId: 'not_found' }));
    }
    return fail(err);
  }
}
