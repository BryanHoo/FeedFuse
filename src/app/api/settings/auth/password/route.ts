import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import {
  createSessionCookieHeader,
  requireApiSession,
} from '@/server/domains/auth/services/session';
import { changeOwnPassword } from '@/server/domains/auth/services/changeOwnPasswordService';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const changePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  nextPassword: z.string(),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = changePasswordBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('密码校验失败', {
        currentPassword: '请输入当前密码',
        nextPassword: '新密码至少需要 8 位',
      });
    }

    // 兼容入口仍只允许初始用户本人操作，密码验证与其他自助入口保持一致。
    const updated = await changeOwnPassword(getPool(), {
      userId: session.userId,
      ...parsed.data,
      initialUserOnly: true,
    });

    return ok(
      { updated: true },
      {
        headers: {
          'set-cookie': await createSessionCookieHeader({
            userId: updated.id,
            role: updated.role,
            sessionVersion: updated.sessionVersion,
          }),
        },
      },
    );
  } catch (err) {
    return fail(err);
  }
}
