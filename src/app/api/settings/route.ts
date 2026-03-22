import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { writeSystemLog } from '../../../server/logging/systemLogger';
import { pruneAllFeedsArticlesToLimit } from '../../../server/repositories/articlesRepo';
import { getUiSettings, updateUiSettings } from '../../../server/repositories/settingsRepo';
import { updateAllFeedsFetchIntervalMinutes } from '../../../server/repositories/feedsRepo';
import { normalizePersistedSettings } from '../../../features/settings/settingsSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pool = getPool();
    const raw = await getUiSettings(pool);
    return ok(normalizePersistedSettings(raw));
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const next = normalizePersistedSettings(json);

    const pool = getPool();
    const prevRaw = await getUiSettings(pool);
    const prev = normalizePersistedSettings(prevRaw);

    const client = await pool.connect();

    try {
      await client.query('begin');
      const saved = await updateUiSettings(client, next);
      const normalizedSaved = normalizePersistedSettings(saved);

      if (prev.rss.fetchIntervalMinutes !== next.rss.fetchIntervalMinutes) {
        await updateAllFeedsFetchIntervalMinutes(client, next.rss.fetchIntervalMinutes);
      }

      if (prev.rss.maxStoredArticlesPerFeed !== normalizedSaved.rss.maxStoredArticlesPerFeed) {
        await pruneAllFeedsArticlesToLimit(client, normalizedSaved.rss.maxStoredArticlesPerFeed);
      }

      const nextLogging = normalizedSaved.logging;
      if (!prev.logging.enabled && nextLogging.enabled) {
        await writeSystemLog(
          client,
          {
            level: 'info',
            category: 'settings',
            message: 'Logging enabled',
            source: 'app/api/settings',
            context: { retentionDays: nextLogging.retentionDays },
          },
          { forceWrite: true },
        );
      } else if (prev.logging.enabled && !nextLogging.enabled) {
        await writeSystemLog(
          client,
          {
            level: 'info',
            category: 'settings',
            message: 'Logging disabled',
            source: 'app/api/settings',
            context: { retentionDays: nextLogging.retentionDays },
          },
          { forceWrite: true },
        );
      } else if (
        nextLogging.enabled &&
        prev.logging.retentionDays !== nextLogging.retentionDays
      ) {
        await writeSystemLog(client, {
          level: 'info',
          category: 'settings',
          message: 'Log retention days updated',
          source: 'app/api/settings',
          context: { retentionDays: nextLogging.retentionDays },
        }, undefined);
      }

      await client.query('commit');
      return ok(normalizedSaved);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return fail(err);
  }
}
