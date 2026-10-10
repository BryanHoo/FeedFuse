import { ok, fail } from '@/server/infra/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from '@/server/infra/http/errors';
import { AUTH_INITIAL_PASSWORD_SETUP_MESSAGE } from '@/server/domains/auth/services/shared';
import { createSessionCookieHeader, verifyUserPassword } from '@/server/domains/auth/services/session';
import { readLoginInput } from '@/server/domains/auth/services/loginInput';
import { getLoginSource, loginThrottle, type LoginAttempt } from '@/server/domains/auth/services/loginThrottle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let attempt: LoginAttempt | undefined;
  try {
    // 先来源配额，再输入边界，再预占账号名额；查询用户和密码计算均位于限流之后。
    attempt = loginThrottle.begin(getLoginSource(request));
    const input = await readLoginInput(request);
    attempt.reserveAccount(input.username);
    const result = await verifyUserPassword(input);
    if (!result.ok) {
      if (result.reason === 'missing_initial_password') {
        throw new ServiceUnavailableError(AUTH_INITIAL_PASSWORD_SETUP_MESSAGE);
      }

      attempt.finish('failure');
      throw new UnauthorizedError('密码错误，请重试');
    }
    if (!result.user) {
      attempt.finish('failure');
      throw new UnauthorizedError('密码错误，请重试');
    }

    attempt.finish('success');
    return ok(
      {
        authenticated: true,
        user: {
          id: result.user.userId,
          type: result.user.userId === '1' ? 'initial_admin' : result.user.role,
          role: result.user.role,
        },
      },
      {
        headers: {
          'set-cookie': await createSessionCookieHeader(result.user),
        },
      },
    );
  } catch (err) {
    if (err instanceof ValidationError) attempt?.finish('failure');
    return fail(err);
  } finally {
    // 包括数据库异常和初始密码未配置在内的所有退出路径，都必须释放预占名额。
    attempt?.finish();
  }
}
