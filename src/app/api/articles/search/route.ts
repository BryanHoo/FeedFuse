import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import { searchArticles } from '../../../../server/repositories/articlesRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  keyword: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).optional(),
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
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));

    if (!parsed.success) {
      return fail(new ValidationError('Invalid query', zodIssuesToFields(parsed.error)));
    }

    const pool = getPool();
    const items = await searchArticles(pool, parsed.data);
    return ok({ items });
  } catch (err) {
    return fail(err);
  }
}
