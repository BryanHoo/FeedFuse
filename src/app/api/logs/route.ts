import { requireApiSession } from '@/server/auth/session';
import { z } from 'zod';
import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { ValidationError } from '../../../server/http/errors';
import { clearSystemLogs, getSystemLogs } from '../../../server/services/systemLogsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  keyword: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        if (!fields[key]) {
          fields[key] = '不支持的查询参数';
        }
      }
      continue;
    }

    const key = issue.path.join('.') || 'query';
    if (!fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

export async function GET(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));

    if (!parsed.success) {
      return fail(new ValidationError('Invalid query', zodIssuesToFields(parsed.error)));
    }

    const pool = getPool();
    const data = await getSystemLogs(pool, parsed.data);
    return ok(data);
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
    const data = await clearSystemLogs(pool);
    return ok(data);
  } catch (err) {
    return fail(err);
  }
}
