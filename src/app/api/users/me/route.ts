import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/infra/http/errors';
import {
  createSessionCookieHeader,
  requireApiSession,
} from '@/server/domains/auth/services/session';
import { changeOwnPassword } from '@/server/domains/auth/services/changeOwnPasswordService';
import { updateUser } from '@/server/domains/auth/repositories/usersRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchCurrentUserBodySchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  currentPassword: z.string().optional(),
  nextPassword: z.string().optional().default(''),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = patchCurrentUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    const nextPassword = parsed.data.nextPassword;
    const shouldChangePassword = nextPassword.length > 0;

    // 涉及改密时必须走共享服务；纯用户名编辑无需当前密码，也不更新会话版本。
    const pool = getPool();
    const user = shouldChangePassword
      ? await changeOwnPassword(pool, {
          userId: session.userId,
          username: parsed.data.username,
          currentPassword: parsed.data.currentPassword,
          nextPassword,
        })
      : await updateUser(pool, { userId: session.userId, username: parsed.data.username });
    if (!user) {
      throw new NotFoundError('用户不存在');
    }

    return ok(
      user,
      shouldChangePassword
        ? {
            headers: {
              'set-cookie': await createSessionCookieHeader({
                userId: user.id,
                role: user.role,
                sessionVersion: user.sessionVersion,
              }),
            },
          }
        : undefined,
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(new ConflictError('用户名已存在', { username: 'duplicate' }));
    }
    return fail(err);
  }
}
