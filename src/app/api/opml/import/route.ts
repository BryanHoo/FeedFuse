import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { fail, ok } from '../../../../server/http/apiResponse';
import { ValidationError } from '../../../../server/http/errors';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';
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
      const error = new ValidationError('Invalid request body', { content: 'required' });
      await writeUserOperationFailedLog(getPool(), {
        actionKey: 'opml.import',
        source: 'app/api/opml/import',
        err: error,
      });
      return fail(error);
    }

    const pool = getPool();
    const result = await importOpml(pool, parsed.data);
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'opml.import',
      source: 'app/api/opml/import',
      context: {
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        invalidCount: result.invalidCount,
      },
    });
    return ok(result);
  } catch (error) {
    await writeUserOperationFailedLog(getPool(), {
      actionKey: 'opml.import',
      source: 'app/api/opml/import',
      err: error,
    });
    return fail(error);
  }
}
