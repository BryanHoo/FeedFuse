import { z } from 'zod';
import { normalizePersistedSettings } from '../../../../../features/settings/settingsSchema';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { NotFoundError, ValidationError } from '../../../../../server/http/errors';
import { getFeedCategoryAssignment } from '../../../../../server/repositories/feedsRepo';
import { getUiSettings, updateUiSettings } from '../../../../../server/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const bodySchema = z.object({
  keywords: z.array(z.string()).default([]),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) {
      fields[key] = issue.message;
    }
  }

  return fields;
}

export async function GET(
  _request: Request,
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

    const pool = getPool();
    const feed = await getFeedCategoryAssignment(pool, paramsParsed.data.id);
    if (!feed) {
      return fail(new NotFoundError('Feed not found'));
    }

    const settings = normalizePersistedSettings(await getUiSettings(pool));
    return ok({
      keywords: settings.rss.articleKeywordFilter.feedKeywordsByFeedId[paramsParsed.data.id] ?? [],
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
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
    const bodyParsed = bodySchema.safeParse(json);
    if (!bodyParsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error)));
    }

    const pool = getPool();
    const feed = await getFeedCategoryAssignment(pool, paramsParsed.data.id);
    if (!feed) {
      return fail(new NotFoundError('Feed not found'));
    }

    const settings = normalizePersistedSettings(await getUiSettings(pool));
    settings.rss.articleKeywordFilter.feedKeywordsByFeedId[paramsParsed.data.id] = bodyParsed.data.keywords;
    const nextSettings = normalizePersistedSettings(settings);
    await updateUiSettings(pool, nextSettings);

    return ok({
      keywords: nextSettings.rss.articleKeywordFilter.feedKeywordsByFeedId[paramsParsed.data.id] ?? [],
    });
  } catch (error) {
    return fail(error);
  }
}
