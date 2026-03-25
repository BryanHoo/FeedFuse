import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { cleanupAiRuntimeState } from '../../../server/ai/cleanupAiRuntimeState';
import {
  hasAiCleanupScopes,
  resolveAiCleanupScopesForInputs,
} from '../../../server/ai/configFingerprints';
import { writeSystemLog } from '../../../server/logging/systemLogger';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../server/logging/userOperationLogger';
import { pruneAllFeedsArticlesToLimit } from '../../../server/repositories/articlesRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
  updateUiSettings,
} from '../../../server/repositories/settingsRepo';
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
  const pool = getPool();

  try {
    const json = await request.json().catch(() => null);
    const next = normalizePersistedSettings(json);

    const [prevRaw, aiApiKey, translationApiKey] = await Promise.all([
      getUiSettings(pool),
      getAiApiKey(pool),
      getTranslationApiKey(pool),
    ]);
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

      await writeUserOperationSucceededLog(client, {
        actionKey: 'settings.save',
        source: 'app/api/settings',
      });

      await client.query('commit');
      const cleanupScopes = resolveAiCleanupScopesForInputs({
        previous: {
          settings: prev,
          aiApiKey,
          translationApiKey,
        },
        next: {
          settings: normalizedSaved,
          aiApiKey,
          translationApiKey,
        },
      });
      if (hasAiCleanupScopes(cleanupScopes)) {
        await cleanupAiRuntimeState({
          pool,
          scopes: cleanupScopes,
        });
      }
      return ok(normalizedSaved);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      actionKey: 'settings.save',
      source: 'app/api/settings',
      err,
    });
    return fail(err);
  }
}
