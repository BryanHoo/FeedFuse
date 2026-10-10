import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeOwnPassword } from '@/server/domains/auth/services/changeOwnPasswordService';
import { hashPassword, verifyPassword } from '@/server/domains/auth/services/password';

const { getUserByIdMock, changeUserPasswordMock, updateUserMock } = vi.hoisted(() => ({
  getUserByIdMock: vi.fn(),
  changeUserPasswordMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock('@/server/domains/auth/repositories/usersRepo', () => ({
  getUserById: getUserByIdMock,
  changeUserPassword: changeUserPasswordMock,
  updateUser: updateUserMock,
}));

const pool = {} as Pool;
const currentPassword = '  old-password-123  ';
const nextPassword = '  new-password-123  ';

describe('changeOwnPassword', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    getUserByIdMock.mockResolvedValue({ id: '2', passwordHash: await hashPassword(currentPassword) });
    const updated = { id: '2', role: 'member', sessionVersion: 2 };
    changeUserPasswordMock.mockResolvedValue(updated);
    updateUserMock.mockResolvedValue(updated);
  });

  // 使用真实密码算法验证服务边界，避免接口测试中的密码 mock 掩盖空格丢失或错误密码放行。
  it.each([undefined, 'renamed-member'])('verifies the actual password and preserves spaces (%s)', async (username) => {
    const updated = await changeOwnPassword(pool, {
      userId: '2', currentPassword, nextPassword, username,
    });
    expect(getUserByIdMock).toHaveBeenCalledWith(pool, '2');
    expect(updated.sessionVersion).toBe(2);
    const writer = username === undefined ? changeUserPasswordMock : updateUserMock;
    const otherWriter = username === undefined ? updateUserMock : changeUserPasswordMock;
    const input = writer.mock.calls[0][1];
    expect(input.userId).toBe('2');
    expect(await verifyPassword(nextPassword, input.passwordHash)).toBe(true);
    expect(await verifyPassword(nextPassword.trim(), input.passwordHash)).toBe(false);
    expect(await verifyPassword(currentPassword, input.passwordHash)).toBe(false);
    expect(otherWriter).not.toHaveBeenCalled();
  });

  it.each(['wrong-password', currentPassword.trim()])('rejects an incorrect actual password without writing (%s)', async (password) => {
    await expect(changeOwnPassword(pool, {
      userId: '2', currentPassword: password, nextPassword, username: 'renamed-member',
    })).rejects.toThrow('当前密码错误，请重试');
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(changeUserPasswordMock).not.toHaveBeenCalled();
  });
});
