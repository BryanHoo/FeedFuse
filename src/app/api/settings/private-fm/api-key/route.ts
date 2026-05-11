import { requireApiSession } from '@/server/auth/session';
import { z } from 'zod';
import { getPool } from '../../../../../server/db/pool';
import { ok, fail } from '../../../../../server/http/apiResponse';
import { ValidationError } from '../../../../../server/http/errors';
import {
  clearPrivateFmApiKey,
  getPrivateFmApiKey,
  setPrivateFmApiKey,
} from '../../../../../server/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.strictObject({
  apiKey: z.string().trim().min(1),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const apiKey = await getPrivateFmApiKey(getPool());
    return ok({ hasApiKey: Boolean(apiKey.trim()) });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    const saved = await setPrivateFmApiKey(getPool(), parsed.data.apiKey);
    return ok({ hasApiKey: Boolean(saved.trim()) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE() {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;

  try {
    await clearPrivateFmApiKey(getPool());
    return ok({ hasApiKey: false });
  } catch (err) {
    return fail(err);
  }
}

