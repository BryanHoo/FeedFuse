import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import { getReaderSnapshot } from '../../../../server/services/readerSnapshotService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  view: z.string().optional().default('all'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  includeFiltered: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'query';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      view: url.searchParams.get('view') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
      includeFiltered: url.searchParams.get('includeFiltered') ?? undefined,
    });
    if (!parsed.success) {
      return fail(new ValidationError('Invalid query', zodIssuesToFields(parsed.error)));
    }

    const pool = getPool();
    const snapshot = await getReaderSnapshot(pool, parsed.data);
    return ok(snapshot);
  } catch (err) {
    return fail(err);
  }
}
