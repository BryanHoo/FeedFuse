import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import { reorderCategories } from '../../../../server/repositories/categoriesRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reorderBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function PATCH(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = reorderBodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    const ids = parsed.data.items.map((item) => item.id);
    const positions = parsed.data.items.map((item) => item.position);

    if (new Set(ids).size !== ids.length || new Set(positions).size !== positions.length) {
      return fail(new ValidationError('Duplicate ids or positions', { items: 'duplicate' }));
    }

    const sorted = [...positions].sort((a, b) => a - b);
    if (!sorted.every((value, index) => value === index)) {
      return fail(
        new ValidationError('Positions must be contiguous from 0', {
          items: 'non_contiguous',
        }),
      );
    }

    const pool = getPool();
    const rows = await reorderCategories(pool, parsed.data.items);
    return ok(rows);
  } catch (error) {
    return fail(error);
  }
}
