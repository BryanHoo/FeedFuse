import { z } from 'zod';
import { getPool } from '@/server/db/pool';
import { AUTH_INITIAL_PASSWORD_SETUP_MESSAGE } from '@/server/auth/shared';
import { createSessionCookieHeader, requireApiSession, verifyPasswordAgainstAuthConfig } from '@/server/auth/session';
import { hashPassword } from '@/server/auth/password';
import { ok, fail } from '@/server/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from '@/server/http/errors';
import { updateAuthPassword } from '@/server/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const changePasswordBodySchema = z.object({
  currentPassword: z.string().trim().min(1),
  nextPassword: z.string().trim().min(8),
});

export async function POST(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
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

    if (parsed.data.currentPassword === parsed.data.nextPassword) {
      throw new ValidationError('新密码不能与当前密码相同', {
        nextPassword: '请设置不同的新密码',
      });
    }

    const currentPasswordResult = await verifyPasswordAgainstAuthConfig(parsed.data.currentPassword);
    if (!currentPasswordResult.ok) {
      if (currentPasswordResult.reason === 'missing_initial_password') {
        throw new ServiceUnavailableError(AUTH_INITIAL_PASSWORD_SETUP_MESSAGE);
      }

      throw new UnauthorizedError('当前密码错误，请重试');
    }

    const nextPasswordHash = hashPassword(parsed.data.nextPassword);
    const authSettings = await updateAuthPassword(getPool(), nextPasswordHash);

    return ok(
      { updated: true },
      {
        headers: {
          'set-cookie': await createSessionCookieHeader(authSettings.authSessionSecret),
        },
      },
    );
  } catch (err) {
    return fail(err);
  }
}
