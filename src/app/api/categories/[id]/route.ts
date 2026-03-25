import { z } from 'zod';
import { getPool } from '../../../../server/db/pool';
import { ok, fail } from '../../../../server/http/apiResponse';
import { numericIdSchema } from '../../../../server/http/idSchemas';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../server/http/errors';
import {
  deleteCategory,
  updateCategory,
} from '../../../../server/repositories/categoriesRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '../../../../server/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

const patchBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
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

const patchOperationSource = 'app/api/categories/[id]';
const deleteOperationSource = 'app/api/categories/[id]';

async function writeCategoryUpdateFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'category.update',
    source: patchOperationSource,
    err,
    context,
  });
}

async function writeCategoryDeleteFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'category.delete',
    source: deleteOperationSource,
    err,
    context,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeCategoryUpdateFailure(error);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error));
      await writeCategoryUpdateFailure(error, { categoryId: paramsParsed.data.id });
      return fail(error);
    }

    const pool = getPool();
    const updated = await updateCategory(pool, paramsParsed.data.id, bodyParsed.data);
    if (!updated) {
      const error = new NotFoundError('Category not found');
      await writeCategoryUpdateFailure(error, { categoryId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'category.update',
      source: patchOperationSource,
      context: { categoryId: updated.id },
    });
    return ok(updated);
  } catch (err) {
    if (isUniqueViolation(err, 'categories_name_unique')) {
      const error = new ConflictError('Category already exists', { name: 'duplicate' });
      await writeCategoryUpdateFailure(error);
      return fail(error);
    }
    await writeCategoryUpdateFailure(err);
    return fail(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeCategoryDeleteFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const deleted = await deleteCategory(pool, paramsParsed.data.id);
    if (!deleted) {
      const error = new NotFoundError('Category not found');
      await writeCategoryDeleteFailure(error, { categoryId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'category.delete',
      source: deleteOperationSource,
      context: { categoryId: paramsParsed.data.id },
    });

    return ok({ deleted: true });
  } catch (err) {
    await writeCategoryDeleteFailure(err);
    return fail(err);
  }
}
