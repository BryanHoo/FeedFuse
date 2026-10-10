import type { Pool } from 'pg';
import {
  changeUserPassword,
  getUserById,
  updateUser,
  type PublicUserRow,
} from '@/server/domains/auth/repositories/usersRepo';
import { hashPassword, verifyPassword } from '@/server/domains/auth/services/password';
import { isPasswordWithinLimit } from '@/server/domains/auth/services/inputLimits';
import { isInitialUser } from '@/server/domains/auth/userType';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@/server/infra/http/errors';

export async function changeOwnPassword(
  pool: Pool,
  input: {
    userId: string;
    currentPassword?: string;
    nextPassword: string;
    username?: string;
    initialUserOnly?: boolean;
  },
): Promise<PublicUserRow> {
  const currentPassword = input.currentPassword ?? '';
  const fields: Record<string, string> = {};
  if (!currentPassword) fields.currentPassword = '请输入当前密码';
  if (input.nextPassword.length < 8) fields.nextPassword = '新密码至少需要 8 位';
  // 在读取用户和派生密码前校验两份输入，给自助改密入口返回准确的字段错误。
  if (!isPasswordWithinLimit(currentPassword)) fields.currentPassword = '密码最多允许 1024 个 UTF-8 字节';
  if (!isPasswordWithinLimit(input.nextPassword)) fields.nextPassword = '密码最多允许 1024 个 UTF-8 字节';
  if (Object.keys(fields).length > 0) {
    throw new ValidationError('密码校验失败', fields);
  }
  if (currentPassword === input.nextPassword) {
    throw new ValidationError('新密码不能与当前密码相同', {
      nextPassword: '请设置不同的新密码',
    });
  }

  // 所有自助入口先验证当前密码，再生成新哈希；有效会话不能替代改密时的身份确认。
  const user = await getUserById(pool, input.userId);
  if (input.initialUserOnly && (!user || !isInitialUser(user))) {
    throw new ForbiddenError('仅初始用户本人可以修改该密码');
  }
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new UnauthorizedError('当前密码错误，请重试');
  }

  const passwordHash = await hashPassword(input.nextPassword);
  // 统一保存用一次仓储更新同时写入用户名和密码，避免验证失败或用户名冲突时部分保存。
  // 两种仓储更新都会递增 session_version，使改密前的其他会话失效。
  const updated = input.username === undefined
    ? await changeUserPassword(pool, { userId: user.id, passwordHash })
    : await updateUser(pool, { userId: user.id, username: input.username, passwordHash });
  if (!updated) {
    throw new NotFoundError('用户不存在');
  }
  return updated;
}
