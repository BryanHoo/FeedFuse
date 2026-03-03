import { getPool } from '../../../../../../server/db/pool';
import { ok, fail } from '../../../../../../server/http/apiResponse';
import { ValidationError } from '../../../../../../server/http/errors';
import {
  clearTranslationApiKey,
  getTranslationApiKey,
  setTranslationApiKey,
} from '../../../../../../server/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readApiKey(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const apiKey = (input as { apiKey?: unknown }).apiKey;
  return typeof apiKey === 'string' ? apiKey : '';
}

export async function GET() {
  try {
    const pool = getPool();
    const apiKey = await getTranslationApiKey(pool);
    return ok({ hasApiKey: apiKey.trim().length > 0 });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const apiKey = readApiKey(json);
    if (!apiKey.trim()) {
      throw new ValidationError('Invalid API key', { apiKey: 'API key is required.' });
    }

    const pool = getPool();
    await setTranslationApiKey(pool, apiKey);
    return ok({ hasApiKey: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE() {
  try {
    const pool = getPool();
    await clearTranslationApiKey(pool);
    return ok({ hasApiKey: false });
  } catch (err) {
    return fail(err);
  }
}
