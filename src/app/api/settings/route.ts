import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { settingsDraftWriteSchema, settingsWriteSchema } from '@/server/domains/settings/settingsWriteSchema';
import { cleanupAiRuntimeState } from '@/server/integrations/ai/cleanupAiRuntimeState';
import {
  hasAiCleanupScopes,
  resolveAiCleanupScopesForInputs,
} from '@/server/integrations/ai/configFingerprints';
import { writeSystemLog } from '@/server/infra/logging/systemLogger';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { pruneAllFeedsArticlesToLimit } from '@/server/domains/articles/repositories/articlesRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
  setAiApiKey,
  setTranslationApiKey,
  updateUiSettings,
} from '@/server/domains/settings/repositories/settingsRepo';
import { updateAllFeedsFetchIntervalMinutes } from '@/server/domains/feeds/repositories/feedsRepo';
import { normalizePersistedSettings } from '../../../features/settings/settingsSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const raw = await getUiSettings(pool, session.userId);
    return ok(normalizePersistedSettings(raw));
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  const pool = getPool();

  try {
    const json = await request.json().catch(() => {
      throw new ValidationError('设置请求必须是有效的 JSON', { body: 'JSON 解析失败' });
    });
    // 在读取旧配置、开启事务及执行清理前校验完整请求，防止无效输入回退默认值后覆盖配置。
    const isDraftRequest = typeof json === 'object' && json !== null && 'settings' in json;
    const parsed = isDraftRequest
      ? settingsDraftWriteSchema.safeParse(json)
      : settingsWriteSchema.safeParse(json);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] === 'settings' ? issue.path.slice(1) : issue.path;
        const key = path.join('.') || 'body';
        if (!fields[key]) fields[key] = issue.message;
      }
      throw new ValidationError('设置请求校验失败', fields);
    }
    const draftInput = 'settings' in parsed.data ? parsed.data : null;
    const next = 'settings' in parsed.data ? parsed.data.settings : parsed.data;
    const secrets = draftInput?.secrets ?? {};

    const [prevRaw, aiApiKey, translationApiKey] = await Promise.all([
      getUiSettings(pool, session.userId),
      getAiApiKey(pool, session.userId),
      getTranslationApiKey(pool, session.userId),
    ]);
    const prev = normalizePersistedSettings(prevRaw);

    const client = await pool.connect();

    try {
      await client.query('begin');
      const saved = await updateUiSettings(client, session.userId, next);
      const validatedSaved = settingsWriteSchema.parse(saved);
      // 设置、两种密钥及运行态清理共用同一连接；任一步失败都回滚，避免部分保存。
      const nextAiApiKey = secrets.aiApiKey === undefined
        ? aiApiKey : await setAiApiKey(client, session.userId, secrets.aiApiKey ?? '');
      const nextTranslationApiKey = secrets.translationApiKey === undefined
        ? translationApiKey : await setTranslationApiKey(client, session.userId, secrets.translationApiKey ?? '');

      if (prev.rss.fetchIntervalMinutes !== next.rss.fetchIntervalMinutes) {
        // 订阅抓取间隔属于当前用户的订阅集合，必须按 userId 限定更新范围。
        await updateAllFeedsFetchIntervalMinutes(client, next.rss.fetchIntervalMinutes, session.userId);
      }

      if (prev.rss.maxStoredArticlesPerFeed !== validatedSaved.rss.maxStoredArticlesPerFeed) {
        // 文章留存上限只应裁剪当前用户的数据，避免串改其他账号内容。
        await pruneAllFeedsArticlesToLimit(
          client,
          validatedSaved.rss.maxStoredArticlesPerFeed,
          session.userId,
        );
      }

      const nextLogging = validatedSaved.logging;
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
        userId: session.userId,
        actionKey: 'settings.save',
        source: 'app/api/settings',
      });

      const cleanupScopes = resolveAiCleanupScopesForInputs({
        previous: {
          settings: prev,
          aiApiKey,
          translationApiKey,
        },
        next: {
          settings: validatedSaved,
          aiApiKey: nextAiApiKey,
          translationApiKey: nextTranslationApiKey,
        },
      });
      if (hasAiCleanupScopes(cleanupScopes)) {
        await cleanupAiRuntimeState({
          pool: client,
          userId: session.userId,
          scopes: cleanupScopes,
        });
      }
      await client.query('commit');
      // 响应只返回密钥是否存在，不向客户端回传任何密钥明文。
      return ok(draftInput ? {
        settings: validatedSaved,
        hasApiKey: Boolean(nextAiApiKey.trim()),
        hasTranslationApiKey: Boolean(nextTranslationApiKey.trim()),
      } : validatedSaved);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      userId: session.userId,
      actionKey: 'settings.save',
      source: 'app/api/settings',
      err,
    });
    return fail(err);
  }
}
