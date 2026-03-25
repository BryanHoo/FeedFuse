import { z } from 'zod';
import { getPool } from '../../../server/db/pool';
import { ok, fail } from '../../../server/http/apiResponse';
import { ConflictError, ValidationError } from '../../../server/http/errors';
import { createCategory, listCategories } from '../../../server/repositories/categoriesRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createCategoryBodySchema = z.object({
  name: z.string().trim().min(1),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

const operationSource = 'app/api/categories';

async function writeCategoryCreateFailure(err: unknown) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'category.create',
    source: operationSource,
    err,
  });
}

export async function GET() {
  try {
    const pool = getPool();
    const categories = await listCategories(pool);
    return ok(categories);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = createCategoryBodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeCategoryCreateFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const created = await createCategory(pool, { name: parsed.data.name });
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'category.create',
      source: operationSource,
      context: { categoryId: created.id },
    });
    return ok(created);
  } catch (err) {
    if (isUniqueViolation(err, 'categories_name_unique')) {
      const error = new ConflictError('Category already exists', { name: 'duplicate' });
      await writeCategoryCreateFailure(error);
      return fail(error);
    }
    await writeCategoryCreateFailure(err);
    return fail(err);
  }
}
