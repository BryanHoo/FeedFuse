import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const requireApiSessionMock = vi.fn();
const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const getUserByIdMock = vi.fn();
const setUserStatusMock = vi.fn();
const resetUserPasswordMock = vi.fn();
const changeUserPasswordMock = vi.fn();
const updateUserMock = vi.fn();
const deleteUserMock = vi.fn();
const deleteUserAndOwnedDataMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();
const hashPasswordMock = vi.fn();
const verifyPasswordMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

vi.mock('@/server/domains/auth/services/password', () => ({
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

vi.mock('@/server/domains/auth/repositories/usersRepo', () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  getUserById: (...args: unknown[]) => getUserByIdMock(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusMock(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPasswordMock(...args),
  changeUserPassword: (...args: unknown[]) => changeUserPasswordMock(...args),
  updateUser: (...args: unknown[]) => updateUserMock(...args),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
}));

vi.mock('@/server/domains/auth/services/userLifecycleService', () => ({
  deleteUserAndOwnedData: (...args: unknown[]) => deleteUserAndOwnedDataMock(...args),
}));

describe('/api/users', () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset().mockResolvedValue({
      userId: '1',
      role: 'admin',
      sessionVersion: 1,
    });
    listUsersMock.mockReset();
    createUserMock.mockReset();
    getUserByIdMock.mockReset();
    setUserStatusMock.mockReset();
    resetUserPasswordMock.mockReset();
    changeUserPasswordMock.mockReset();
    updateUserMock.mockReset();
    deleteUserMock.mockReset();
    deleteUserAndOwnedDataMock.mockReset();
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=rotated-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
    hashPasswordMock.mockReset().mockResolvedValue('scrypt$hashed');
    verifyPasswordMock.mockReset().mockResolvedValue(true);
  });

  it('GET lists users for admins', async () => {
    listUsersMock.mockResolvedValue([
      { id: '1', username: 'admin', role: 'admin', status: 'active', sessionVersion: 1, type: 'initial_admin' },
    ]);

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data[0].username).toBe('admin');
    expect(listUsersMock).toHaveBeenCalledWith(pool);
  });

  it('GET rejects members', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '2', role: 'member', sessionVersion: 1 });

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.GET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('forbidden');
  });

  it('POST creates users for admins', async () => {
    createUserMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.POST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'member', password: 'password-123', role: 'member' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(hashPasswordMock).toHaveBeenCalledWith('password-123');
    expect(createUserMock).toHaveBeenCalledWith(pool, {
      username: 'member',
      passwordHash: 'scrypt$hashed',
      role: 'member',
    });
  });

  it('POST preserves leading and trailing spaces in created user passwords', async () => {
    createUserMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });

    const mod = await import('../../../../app/api/users/route');
    await mod.POST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'member', password: '  password-123  ', role: 'member' }),
      }),
    );

    expect(hashPasswordMock).toHaveBeenCalledWith('  password-123  ');
  });

  it.each([
    { username: 'a'.repeat(129), password: 'password-123' },
    { username: 'member', password: 'a'.repeat(1025) },
  ])('rejects credentials that exceed login input limits (case %#)', async (input) => {
    createUserMock.mockResolvedValue({ id: '2', username: input.username, role: 'member', status: 'active', sessionVersion: 1 });
    const { POST } = await import('../../../../app/api/users/route');
    const response = await POST(new Request('http://localhost/api/users', {
      method: 'POST', body: JSON.stringify(input),
    }));
    expect(response.status).toBe(400);
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('PATCH updates username role status and password', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '2',
      username: 'member',
      passwordHash: 'hash',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });
    updateUserMock.mockResolvedValue({
      id: '2',
      username: 'member-next',
      role: 'admin',
      status: 'disabled',
      sessionVersion: 3,
      type: 'admin',
    });

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'member-next',
          role: 'admin',
          status: 'disabled',
          password: 'next-password-123',
        }),
      }),
      { params: Promise.resolve({ id: '2' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith(pool, {
      userId: '2',
      username: 'member-next',
      role: 'admin',
      status: 'disabled',
      passwordHash: 'scrypt$hashed',
    });
  });

  it('PATCH preserves leading and trailing spaces in admin-reset passwords', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '2',
      username: 'member',
      passwordHash: 'hash',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });
    updateUserMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 2,
      type: 'member',
    });

    const mod = await import('../../../../app/api/users/[id]/route');
    await mod.PATCH(
      new Request('http://localhost/api/users/2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: '  next-password-123  ' }),
      }),
      { params: Promise.resolve({ id: '2' }) },
    );

    expect(hashPasswordMock).toHaveBeenCalledWith('  next-password-123  ');
  });

  it('PATCH /api/users/me updates current user username', async () => {
    updateUserMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      type: 'initial_admin',
    });

    const mod = await import('../../../../app/api/users/me/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'renamed-admin' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(updateUserMock).toHaveBeenCalledWith(pool, {
      userId: '1',
      username: 'renamed-admin',
    });
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('PATCH /api/users/me updates username and password together', async () => {
    getUserByIdMock.mockResolvedValue({ id: '1', passwordHash: 'scrypt$old', role: 'admin' });
    updateUserMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      role: 'admin',
      status: 'active',
      sessionVersion: 2,
      type: 'initial_admin',
    });

    const mod = await import('../../../../app/api/users/me/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'renamed-admin',
          currentPassword: 'old-password-123',
          nextPassword: 'new-password-123',
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(verifyPasswordMock).toHaveBeenCalledWith('old-password-123', 'scrypt$old');
    expect(hashPasswordMock).toHaveBeenCalledWith('new-password-123');
    expect(updateUserMock).toHaveBeenCalledWith(pool, {
      userId: '1',
      username: 'renamed-admin',
      passwordHash: 'scrypt$hashed',
    });
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith({
      userId: '1',
      role: 'admin',
      sessionVersion: 2,
    });
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=rotated-token');
  });

  it('PATCH /api/users/me preserves leading and trailing spaces in nextPassword', async () => {
    getUserByIdMock.mockResolvedValue({ id: '1', passwordHash: 'scrypt$old', role: 'admin' });
    updateUserMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      role: 'admin',
      status: 'active',
      sessionVersion: 2,
      type: 'initial_admin',
    });

    const mod = await import('../../../../app/api/users/me/route');
    await mod.PATCH(
      new Request('http://localhost/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'renamed-admin',
          currentPassword: '  old-password-123  ',
          nextPassword: '  new-password-123  ',
        }),
      }),
    );

    expect(hashPasswordMock).toHaveBeenCalledWith('  new-password-123  ');
    expect(verifyPasswordMock).toHaveBeenCalledWith('  old-password-123  ', 'scrypt$old');
  });

  // 同一组拒绝用例覆盖所有自助改密入口，防止统一保存或兼容接口绕过验证。
  describe.each([
    ['/api/users/me', 'PATCH'],
    ['/api/users/me/password', 'POST'],
    ['/api/settings/auth/password', 'POST'],
  ])('%s password verification', (path, method) => {
    const requestChange = async (payload: Record<string, unknown>) => {
      const route = path === '/api/users/me'
        ? await import('../../../../app/api/users/me/route')
        : path === '/api/users/me/password'
          ? await import('../../../../app/api/users/me/password/route')
          : await import('../../../../app/api/settings/auth/password/route');
      const request = new Request(`http://localhost${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'renamed-admin', nextPassword: 'new-password-123', ...payload }),
      });
      return 'PATCH' in route ? route.PATCH(request) : route.POST(request);
    };

    beforeEach(() => {
      getUserByIdMock.mockResolvedValue({
        id: '1', passwordHash: 'scrypt$old', role: 'admin', type: 'initial_admin',
      });
      updateUserMock.mockResolvedValue({ id: '1', role: 'admin', sessionVersion: 2 });
    });

    it.each([undefined, ''])('rejects missing current password (%s) without writing', async (currentPassword) => {
      const res = await requestChange({ currentPassword });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields.currentPassword).toBe('请输入当前密码');
      expect(hashPasswordMock).not.toHaveBeenCalled();
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(changeUserPasswordMock).not.toHaveBeenCalled();
      expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
    });

    it('rejects wrong current password without changing username or password', async () => {
      verifyPasswordMock.mockResolvedValue(false);
      const res = await requestChange({ currentPassword: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(hashPasswordMock).not.toHaveBeenCalled();
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(changeUserPasswordMock).not.toHaveBeenCalled();
      expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
    });

    it('rejects unchanged passwords without writing', async () => {
      const res = await requestChange({ currentPassword: 'new-password-123' });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields.nextPassword).toBe('请设置不同的新密码');
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(changeUserPasswordMock).not.toHaveBeenCalled();
      expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
    });

    it('rejects short next passwords before verification or writing', async () => {
      const res = await requestChange({ currentPassword: 'old-password-123', nextPassword: 'short' });
      expect(res.status).toBe(400);
      expect((await res.json()).error.fields.nextPassword).toBe('新密码至少需要 8 位');
      expect(verifyPasswordMock).not.toHaveBeenCalled();
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(changeUserPasswordMock).not.toHaveBeenCalled();
      expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
    });

    it('does not rotate the cookie if the user disappears before writing', async () => {
      updateUserMock.mockResolvedValue(null);
      changeUserPasswordMock.mockResolvedValue(null);
      const res = await requestChange({ currentPassword: 'old-password-123' });
      expect(res.status).toBe(404);
      expect(createSessionCookieHeaderMock).not.toHaveBeenCalled();
      expect(res.headers.get('set-cookie')).toBeNull();
    });
  });

  it('PATCH /api/users/me rejects incomplete password change payload', async () => {
    updateUserMock.mockResolvedValue(null);

    const mod = await import('../../../../app/api/users/me/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'admin',
          nextPassword: 'short',
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.nextPassword).toBe('新密码至少需要 8 位');
  });

  it('PATCH /api/users/me returns 409 when username already exists', async () => {
    updateUserMock.mockRejectedValue({ code: '23505' });

    const mod = await import('../../../../app/api/users/me/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'member' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('conflict');
  });

  it('POST /api/users/me/password changes current user password', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '2', role: 'member', sessionVersion: 1 });
    getUserByIdMock.mockResolvedValue({
      id: '2',
      username: 'member',
      passwordHash: 'scrypt$old',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });
    changeUserPasswordMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 2,
      type: 'member',
    });

    const mod = await import('../../../../app/api/users/me/password/route');
    const res = await mod.POST(
      new Request('http://localhost/api/users/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'old-password-123', nextPassword: 'new-password-123' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(changeUserPasswordMock).toHaveBeenCalledWith(pool, {
      userId: '2',
      passwordHash: 'scrypt$hashed',
    });
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith({
      userId: '2',
      role: 'member',
      sessionVersion: 2,
    });
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=rotated-token');
  });

  it('POST /api/users/me/password preserves spaces when verifying and hashing passwords', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '2', role: 'member', sessionVersion: 1 });
    getUserByIdMock.mockResolvedValue({
      id: '2',
      username: 'member',
      passwordHash: 'scrypt$old',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
      type: 'member',
    });
    changeUserPasswordMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 2,
      type: 'member',
    });

    const mod = await import('../../../../app/api/users/me/password/route');
    await mod.POST(
      new Request('http://localhost/api/users/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: '  old-password-123  ',
          nextPassword: '  new-password-123  ',
        }),
      }),
    );

    expect(verifyPasswordMock).toHaveBeenCalledWith('  old-password-123  ', 'scrypt$old');
    expect(hashPasswordMock).toHaveBeenCalledWith('  new-password-123  ');
  });

  it('PATCH rejects editing the initial user through admin endpoint', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '1',
      username: 'renamed-admin',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
      type: 'initial_admin',
    });

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'hijacked-admin',
          role: 'member',
          status: 'disabled',
        }),
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('forbidden');
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it('DELETE rejects non-initial admin even if role is admin', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '3', role: 'admin', sessionVersion: 1 });
    getUserByIdMock
      .mockResolvedValueOnce({
        id: '3',
        username: 'ops-admin',
        passwordHash: 'hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      });

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.DELETE(
      new Request('http://localhost/api/users/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '2' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('forbidden');
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('DELETE rejects deleting the initial admin user', async () => {
    getUserByIdMock
      .mockResolvedValueOnce({
        id: '1',
        username: 'admin',
        passwordHash: 'hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      })
      .mockResolvedValueOnce({
        id: '1',
        username: 'admin',
        passwordHash: 'hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      });

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.DELETE(
      new Request('http://localhost/api/users/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('forbidden');
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('DELETE removes non-initial users for the initial admin', async () => {
    getUserByIdMock
      .mockResolvedValueOnce({
        id: '1',
        username: 'admin',
        passwordHash: 'hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      })
      .mockResolvedValueOnce({
        id: '2',
        username: 'member',
        passwordHash: 'hash',
        role: 'member',
        status: 'active',
        sessionVersion: 1,
      });
    deleteUserAndOwnedDataMock.mockResolvedValue(true);

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.DELETE(
      new Request('http://localhost/api/users/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '2' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ deleted: true });
    expect(deleteUserAndOwnedDataMock).toHaveBeenCalledWith(pool, '2');
  });

  it('DELETE still allows the renamed initial admin to delete others', async () => {
    getUserByIdMock
      .mockResolvedValueOnce({
        id: '1',
        username: 'renamed-admin',
        passwordHash: 'hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 1,
      })
      .mockResolvedValueOnce({
        id: '2',
        username: 'member',
        passwordHash: 'hash',
        role: 'member',
        status: 'active',
        sessionVersion: 1,
      });
    deleteUserAndOwnedDataMock.mockResolvedValue(true);

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.DELETE(
      new Request('http://localhost/api/users/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '2' }) },
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(deleteUserAndOwnedDataMock).toHaveBeenCalledWith(pool, '2');
  });
});
