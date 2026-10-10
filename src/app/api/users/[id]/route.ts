import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { hashPassword } from '@/server/domains/auth/services/password';
import { isPasswordWithinLimit, MAX_USERNAME_LENGTH } from '@/server/domains/auth/services/inputLimits';
import { getUserById, updateUser } from '@/server/domains/auth/repositories/usersRepo';
import { deleteUserAndOwnedData } from '@/server/domains/auth/services/userLifecycleService';
import { isInitialUser } from '@/server/domains/auth/userType';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchUserBodySchema = z.object({
  username: z.string().max(MAX_USERNAME_LENGTH, '用户名最多允许 128 个字符').trim().min(1).optional(),
  role: z.enum(['admin', 'member']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().min(8).refine(isPasswordWithinLimit, '密码最多允许 1024 个 UTF-8 字节').optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function requireAdmin() {
  const session = await requireApiSession();
  if ('response' in session) {
    return session;
  }
  if (session.role !== 'admin') {
    return { response: fail(new ForbiddenError()) };
  }
  return session;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if ('response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const parsedId = numericIdSchema.safeParse(params.id);
    if (!parsedId.success) {
      throw new ValidationError('用户 ID 无效', { id: 'Invalid numeric id' });
    }

    const json = await request.json().catch(() => null);
    const parsed = patchUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    const pool = getPool();
    const target = await getUserById(pool, parsedId.data);
    if (!target) {
      throw new NotFoundError('用户不存在');
    }
    if (isInitialUser(target)) {
      throw new ForbiddenError('初始用户只能由本人修改');
    }

    // 管理员编辑用户信息统一走一个 patch，前端可在单个弹窗里提交完整修改。
    const user = await updateUser(pool, {
      userId: parsedId.data,
      username: parsed.data.username,
      role: parsed.data.role,
      status: parsed.data.status,
      passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : undefined,
    });
    return ok(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(new ConflictError('用户名已存在', { username: 'duplicate' }));
    }
    return fail(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if ('response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const parsedId = numericIdSchema.safeParse(params.id);
    if (!parsedId.success) {
      throw new ValidationError('用户 ID 无效', { id: 'Invalid numeric id' });
    }

    const pool = getPool();
    const actor = await getUserById(pool, session.userId);
    if (!actor || !isInitialUser(actor)) {
      throw new ForbiddenError('仅初始用户可以删除其他用户');
    }

    const target = await getUserById(pool, parsedId.data);
    if (!target) {
      throw new NotFoundError('用户不存在');
    }

    if (target.id === session.userId) {
      throw new ForbiddenError('不能删除当前登录用户');
    }

    if (isInitialUser(target)) {
      throw new ForbiddenError('初始用户不可删除');
    }

    const deleted = await deleteUserAndOwnedData(pool, parsedId.data);
    if (!deleted) {
      throw new NotFoundError('用户不存在');
    }

    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
