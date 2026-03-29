import { z } from 'zod';
import { ok, fail } from '@/server/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from '@/server/http/errors';
import { AUTH_INITIAL_PASSWORD_SETUP_MESSAGE } from '@/server/auth/shared';
import { createSessionCookieHeader, verifyPasswordAgainstAuthConfig } from '@/server/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginBodySchema = z.object({
  password: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = loginBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('登录密码不能为空', { password: '请输入密码' });
    }

    const result = await verifyPasswordAgainstAuthConfig(parsed.data.password);
    if (!result.ok) {
      if (result.reason === 'missing_initial_password') {
        throw new ServiceUnavailableError(AUTH_INITIAL_PASSWORD_SETUP_MESSAGE);
      }

      throw new UnauthorizedError('密码错误，请重试');
    }

    return ok(
      { authenticated: true },
      {
        headers: {
          'set-cookie': await createSessionCookieHeader(),
        },
      },
    );
  } catch (err) {
    return fail(err);
  }
}
