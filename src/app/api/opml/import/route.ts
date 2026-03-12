import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { fail, ok } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import { importOpml } from '../../../../server/services/opmlService';

const bodySchema = z.object({
  content: z.string().trim().min(1),
  fileName: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', { content: 'required' }));
    }

    const result = await importOpml(getPool(), parsed.data);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
