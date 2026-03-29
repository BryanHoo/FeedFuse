import { requireApiSession } from '@/server/auth/session';
import { getPool } from '../../../../../server/db/pool';
import { cleanupAiRuntimeState } from '../../../../../server/ai/cleanupAiRuntimeState';
import {
  hasAiCleanupScopes,
  resolveAiCleanupScopesForInputs,
} from '../../../../../server/ai/configFingerprints';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { ValidationError } from '../../../../../server/http/errors';
import {
  clearTranslationApiKey,
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
  setTranslationApiKey,
} from '../../../../../server/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readApiKey(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const apiKey = (input as { apiKey?: unknown }).apiKey;
  return typeof apiKey === 'string' ? apiKey : '';
}

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const pool = getPool();
    const apiKey = await getTranslationApiKey(pool);
    return ok({ hasApiKey: apiKey.trim().length > 0 });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const json = await request.json().catch(() => null);
    const apiKey = readApiKey(json);
    if (!apiKey.trim()) {
      throw new ValidationError('Invalid API key', { apiKey: 'API key is required.' });
    }

    const pool = getPool();
    const [uiSettings, aiApiKey, currentTranslationApiKey] = await Promise.all([
      getUiSettings(pool),
      getAiApiKey(pool),
      getTranslationApiKey(pool),
    ]);
    await setTranslationApiKey(pool, apiKey);
    const cleanupScopes = resolveAiCleanupScopesForInputs({
      previous: {
        settings: uiSettings,
        aiApiKey,
        translationApiKey: currentTranslationApiKey,
      },
      next: {
        settings: uiSettings,
        aiApiKey,
        translationApiKey: apiKey,
      },
    });
    if (hasAiCleanupScopes(cleanupScopes)) {
      await cleanupAiRuntimeState({
        pool,
        scopes: cleanupScopes,
      });
    }
    return ok({ hasApiKey: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE() {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const pool = getPool();
    const [uiSettings, aiApiKey, currentTranslationApiKey] = await Promise.all([
      getUiSettings(pool),
      getAiApiKey(pool),
      getTranslationApiKey(pool),
    ]);
    await clearTranslationApiKey(pool);
    const cleanupScopes = resolveAiCleanupScopesForInputs({
      previous: {
        settings: uiSettings,
        aiApiKey,
        translationApiKey: currentTranslationApiKey,
      },
      next: {
        settings: uiSettings,
        aiApiKey,
        translationApiKey: '',
      },
    });
    if (hasAiCleanupScopes(cleanupScopes)) {
      await cleanupAiRuntimeState({
        pool,
        scopes: cleanupScopes,
      });
    }
    return ok({ hasApiKey: false });
  } catch (err) {
    return fail(err);
  }
}
