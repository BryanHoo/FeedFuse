import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ConflictError, ForbiddenError, ValidationError } from '@/server/infra/http/errors';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { hashPassword } from '@/server/domains/auth/services/password';
import { isPasswordWithinLimit, MAX_USERNAME_LENGTH } from '@/server/domains/auth/services/inputLimits';
import { createUser, listUsers } from '@/server/domains/auth/repositories/usersRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createUserBodySchema = z.object({
  username: z.string().max(MAX_USERNAME_LENGTH, '用户名最多允许 128 个字符').trim().min(1),
  password: z.string().min(8).refine(isPasswordWithinLimit, '密码最多允许 1024 个 UTF-8 字节'),
  role: z.enum(['admin', 'member']).default('member'),
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

export async function GET() {
  const session = await requireAdmin();
  if ('response' in session) {
    return session.response;
  }

  try {
    return ok(await listUsers(getPool()));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = createUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    const user = await createUser(getPool(), {
      username: parsed.data.username,
      passwordHash: await hashPassword(parsed.data.password),
      role: parsed.data.role,
    });

    return ok({
      id: user.id,
      username: user.username,
      type: user.type,
      role: user.role,
      status: user.status,
      sessionVersion: user.sessionVersion,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(new ConflictError('用户名已存在', { username: 'duplicate' }));
    }
    return fail(err);
  }
}
