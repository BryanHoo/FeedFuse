'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { SquarePen, UserPlus } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ApiError,
  createUser,
  deleteUser,
  listUsers,
  logout,
  updateCurrentUserProfile,
  updateUser,
  type CurrentUser,
  type CurrentUserRole,
  type CurrentUserStatus,
} from '@/lib/api/apiClient';
import { useAuthStore } from '@/store/authStore';

type SecurityDialogMode = 'current-user' | 'create-user' | 'edit-user';

interface UserFormState {
  username: string;
  role: CurrentUserRole;
  status: CurrentUserStatus;
  password: string;
}

const EMPTY_USER_FORM: UserFormState = {
  username: '',
  role: 'member',
  status: 'active',
  password: '',
};

function getRoleLabel(role?: CurrentUserRole): string {
  return role === 'admin' ? '管理员' : '成员';
}

function getUserTypeLabel(user: CurrentUser | null | undefined): string | null {
  return user?.type === 'initial_admin' ? '初始用户' : null;
}

function getStatusLabel(status?: CurrentUserStatus): string {
  return status === 'disabled' ? '已禁用' : '启用中';
}

function getStatusBadgeVariant(status?: CurrentUserStatus): 'destructive' | 'outline' {
  return status === 'disabled' ? 'destructive' : 'outline';
}

function buildEditUserForm(user: CurrentUser): UserFormState {
  return {
    username: user.username ?? '',
    role: user.role,
    status: user.status ?? 'active',
    password: '',
  };
}

function isInitialAdminUser(user: CurrentUser | null | undefined): boolean {
  return user?.type === 'initial_admin';
}

export default function SecuritySettingsPanel() {
  const nextPasswordLabelId = 'settings-next-password-label';
  const confirmPasswordLabelId = 'settings-confirm-password-label';
  const currentUser = useAuthStore((state) => state.currentUser);
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);
  const clearCurrentUser = useAuthStore((state) => state.clearCurrentUser);

  const [users, setUsers] = useState<CurrentUser[]>([]);
  const [usersMessage, setUsersMessage] = useState('');
  const [isUsersError, setIsUsersError] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentUsername, setCurrentUsername] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<CurrentUser | null>(null);
  const [dialogMode, setDialogMode] = useState<SecurityDialogMode | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>(EMPTY_USER_FORM);
  const [isCurrentUserPending, startCurrentUserTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();
  const [isUsersPending, startUsersTransition] = useTransition();
  const [isDeletePending, startDeleteTransition] = useTransition();

  const isAdmin = currentUser?.role === 'admin';
  const canDeleteManagedUsers = isInitialAdminUser(currentUser);
  const isUserEditorOpen = dialogMode === 'create-user' || dialogMode === 'edit-user';
  const managedUsers = useMemo(
    () => users.filter((user) => !isInitialAdminUser(user)),
    [users],
  );
  const editingUser = useMemo(
    () => users.find((user) => user.id === editingUserId) ?? null,
    [editingUserId, users],
  );

  const resetUsersFeedback = () => {
    setUsersMessage('');
    setIsUsersError(false);
  };

  const resetSecurityFeedback = () => {
    setSecurityMessage('');
    setIsSecurityError(false);
  };

  const loadUsers = () => {
    if (!isAdmin) {
      setUsers([]);
      return;
    }

    startUsersTransition(() => {
      void listUsers({ notifyOnError: false })
        .then((items) => {
          setUsers(items);
          setIsUsersError(false);
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '加载用户失败');
        });
    });
  };

  useEffect(() => {
    loadUsers();
    // 只在当前用户身份变化时刷新用户列表。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  const resetSecurityForm = () => {
    // 保存成功或关闭弹窗后清空全部密码，避免敏感输入留在下一次编辑中。
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  const closeEditorDialog = () => {
    setDialogMode(null);
    setEditingUserId(null);
    setUserForm(EMPTY_USER_FORM);
    resetUsersFeedback();
    resetSecurityFeedback();
    resetSecurityForm();
  };

  const closeDeleteDialog = () => {
    if (isDeletePending) {
      return;
    }
    setDeletingUser(null);
    resetUsersFeedback();
  };

  const openCurrentUserDialog = () => {
    setDialogMode('current-user');
    setCurrentUsername(currentUser?.username ?? '');
    resetSecurityFeedback();
    resetSecurityForm();
  };

  const openCreateUserDialog = () => {
    setDialogMode('create-user');
    setEditingUserId(null);
    setUserForm(EMPTY_USER_FORM);
    resetUsersFeedback();
  };

  const openEditUserDialog = (user: CurrentUser) => {
    setDialogMode('edit-user');
    setEditingUserId(user.id);
    // 管理员表格只承载信息展示，所有可编辑数据进入弹窗统一处理。
    setUserForm(buildEditUserForm(user));
    resetUsersFeedback();
  };

  const openDeleteDialog = (user: CurrentUser) => {
    setDeletingUser(user);
    resetUsersFeedback();
  };

  const submitCurrentUserProfile = () => {
    const normalizedUsername = currentUsername.trim();
    const normalizedNextPassword = nextPassword.trim();
    const normalizedConfirmPassword = confirmPassword.trim();
    const shouldChangePassword =
      normalizedNextPassword.length > 0 || normalizedConfirmPassword.length > 0;

    if (!normalizedUsername) {
      setIsSecurityError(true);
      setSecurityMessage('请输入用户名');
      return;
    }

    if (shouldChangePassword) {
      if (normalizedNextPassword.length < 8) {
        setIsSecurityError(true);
        setSecurityMessage('新密码至少需要 8 位');
        return;
      }

      if (normalizedNextPassword !== normalizedConfirmPassword) {
        setIsSecurityError(true);
        setSecurityMessage('两次输入的新密码不一致');
        return;
      }

      if (!currentPassword) {
        setIsSecurityError(true);
        setSecurityMessage('请输入当前密码');
        return;
      }
    }

    setSecurityMessage('');
    setIsSecurityError(false);

    startCurrentUserTransition(() => {
      void updateCurrentUserProfile(
        {
          username: normalizedUsername,
          // 仅改密时提交当前密码，并保留用户输入的前后空格供后端验证。
          currentPassword: shouldChangePassword ? currentPassword : undefined,
          nextPassword: shouldChangePassword ? nextPassword : undefined,
        },
        { notifyOnError: false, redirectOnUnauthorized: false },
      )
        .then((updated) => {
          // 当前账号保存成功后，同时刷新当前用户和管理员列表中的镜像数据。
          setCurrentUser(updated);
          setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          setCurrentUsername(updated.username ?? normalizedUsername);
          resetSecurityForm();
          setIsSecurityError(false);
          setSecurityMessage('账号信息已更新');
        })
        .catch((err) => {
          setIsSecurityError(true);
          setSecurityMessage(err instanceof ApiError ? err.message : '更新账号信息失败，请稍后重试');
        });
    });
  };

  const handleLogout = () => {
    setSecurityMessage('');

    startLogoutTransition(() => {
      void (async () => {
        try {
          await logout({ notifyOnError: false, redirectOnUnauthorized: false });
        } finally {
          clearCurrentUser();
          window.location.assign('/login');
        }
      })();
    });
  };

  const submitCreateUser = () => {
    setUsersMessage('');
    setIsUsersError(false);

    if (!userForm.username.trim() || userForm.password.trim().length < 8) {
      setIsUsersError(true);
      setUsersMessage('请输入用户名和至少 8 位密码');
      return;
    }

    startUsersTransition(() => {
      void createUser(
        {
          username: userForm.username.trim(),
          password: userForm.password,
          role: userForm.role,
        },
        { notifyOnError: false },
      )
        .then((created) => {
          setUsers((items) => [...items, created]);
          closeEditorDialog();
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '创建用户失败');
        });
    });
  };

  const submitEditUser = () => {
    if (!editingUser) {
      return;
    }

    const normalizedUsername = userForm.username.trim();
    if (!normalizedUsername) {
      setIsUsersError(true);
      setUsersMessage('请输入用户名');
      return;
    }

    setUsersMessage('');
    setIsUsersError(false);

    const patch: {
      username?: string;
      role?: CurrentUserRole;
      status?: CurrentUserStatus;
      password?: string;
    } = {
      username: normalizedUsername,
      role: userForm.role,
      status: userForm.status,
    };

    startUsersTransition(() => {
      void updateUser(editingUser.id, patch, { notifyOnError: false })
        .then((updated) => {
          setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          if (updated.id === currentUser?.id && currentUser) {
            setCurrentUser({ ...currentUser, ...updated });
          }
          closeEditorDialog();
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '更新用户失败');
        });
    });
  };

  const submitDeleteUser = () => {
    if (!deletingUser) {
      return;
    }

    setUsersMessage('');
    setIsUsersError(false);

    startDeleteTransition(() => {
      void deleteUser(deletingUser.id, { notifyOnError: false })
        .then(() => {
          setUsers((items) => items.filter((item) => item.id !== deletingUser.id));
          setDeletingUser(null);
        })
        .catch((err) => {
          setIsUsersError(true);
          setUsersMessage(err instanceof ApiError ? err.message : '删除用户失败');
        });
    });
  };

  return (
    <>
      <section className="space-y-5">
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">当前账号</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-medium text-foreground">{currentUser?.username ?? 'admin'}</p>
                  {getUserTypeLabel(currentUser) ? (
                    <Badge variant="default">{getUserTypeLabel(currentUser)}</Badge>
                  ) : null}
                  <Badge variant="secondary">{getRoleLabel(currentUser?.role)}</Badge>
                  <Badge variant={getStatusBadgeVariant(currentUser?.status)}>
                    {getStatusLabel(currentUser?.status)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                data-testid="security-current-user-edit-button"
                onClick={openCurrentUserDialog}
              >
                <SquarePen className="mr-2 h-4 w-4" />
                编辑
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="compact"
                onClick={() => setLogoutConfirmOpen(true)}
                disabled={isLogoutPending}
              >
                {isLogoutPending ? '退出中…' : '退出登录'}
              </Button>
            </div>
          </div>
        </div>

        {isAdmin ? (
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-foreground">用户管理</p>
              <Button
                type="button"
                size="compact"
                data-testid="security-create-user-button"
                onClick={openCreateUserDialog}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                新增用户
              </Button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">用户名</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">角色</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {managedUsers.length > 0 ? (
                    managedUsers.map((user) => (
                      <tr key={user.id} className="bg-background">
                        <td className="px-4 py-3 font-medium text-foreground">{user.username ?? `#${user.id}`}</td>
                        <td className="px-4 py-3">
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {getRoleLabel(user.role)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={getStatusBadgeVariant(user.status)}>
                            {getStatusLabel(user.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="compact"
                              variant="secondary"
                              data-testid={`security-user-edit-${user.id}`}
                              onClick={() => openEditUserDialog(user)}
                            >
                              编辑
                            </Button>
                            {canDeleteManagedUsers ? (
                              <Button
                                type="button"
                                size="compact"
                                variant="destructive"
                                data-testid={`security-user-delete-${user.id}`}
                                onClick={() => openDeleteDialog(user)}
                              >
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr className="bg-background">
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-sm text-muted-foreground"
                      >
                        暂无用户
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {usersMessage ? (
              <p className={isUsersError ? 'mt-3 text-sm text-red-600' : 'mt-3 text-sm text-muted-foreground'}>
                {usersMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <Dialog
        open={dialogMode === 'current-user'}
        onOpenChange={(open) => {
          if (!open) {
            closeEditorDialog();
          }
        }}
      >
        <DialogContent
          className="max-w-xl"
          closeLabel="关闭当前账号编辑弹窗"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>编辑当前账号</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="settings-current-username">用户名</Label>
              <Input
                id="settings-current-username"
                value={currentUsername}
                onChange={(event) => setCurrentUsername(event.target.value)}
                placeholder="输入用户名"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-current-password">当前密码</Label>
              <Input
                id="settings-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="修改密码时必填"
              />
            </div>

            <div className="space-y-2">
              <Label id={nextPasswordLabelId} htmlFor="settings-next-password">
                新密码
              </Label>
              <Input
                id="settings-next-password"
                type="password"
                autoComplete="new-password"
                aria-labelledby={nextPasswordLabelId}
                value={nextPassword}
                onChange={(event) => setNextPassword(event.target.value)}
                placeholder="至少 8 位"
              />
            </div>
            <div className="space-y-2">
              <Label id={confirmPasswordLabelId} htmlFor="settings-confirm-password">
                确认新密码
              </Label>
              <Input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                aria-labelledby={confirmPasswordLabelId}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入新密码"
              />
            </div>
          </div>

          <DialogFooter className="items-center gap-3">
            {securityMessage ? (
              <p className={isSecurityError ? 'text-sm text-red-600' : 'text-sm text-muted-foreground'}>
                {securityMessage}
              </p>
            ) : null}
            <Button type="button" variant="secondary" onClick={closeEditorDialog}>
              关闭
            </Button>
            <Button type="button" onClick={submitCurrentUserProfile} disabled={isCurrentUserPending}>
              {isCurrentUserPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isUserEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeEditorDialog();
          }
        }}
      >
        <DialogContent
          className="max-w-xl"
          closeLabel="关闭用户编辑弹窗"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create-user' ? '新增用户' : '编辑用户'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="security-user-form-username">用户名</Label>
              <Input
                id="security-user-form-username"
                value={userForm.username}
                onChange={(event) =>
                  setUserForm((current) => ({ ...current, username: event.target.value }))
                }
                placeholder="输入用户名"
                autoComplete="off"
              />
            </div>

            {dialogMode === 'create-user' ? (
              <div className="space-y-2">
                <Label htmlFor="security-user-form-password">新密码</Label>
                <Input
                  id="security-user-form-password"
                  type="password"
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="至少 8 位"
                  autoComplete="new-password"
                />
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="security-user-form-role">角色</Label>
                <Select
                  value={userForm.role}
                  onValueChange={(value) =>
                    setUserForm((current) => ({
                      ...current,
                      role: value as CurrentUserRole,
                    }))
                  }
                >
                  <SelectTrigger id="security-user-form-role" aria-label="角色">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">成员</SelectItem>
                    <SelectItem value="admin">管理员</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="security-user-form-status">状态</Label>
                <Select
                  value={userForm.status}
                  onValueChange={(value) =>
                    setUserForm((current) => ({
                      ...current,
                      status: value as CurrentUserStatus,
                    }))
                  }
                >
                  <SelectTrigger id="security-user-form-status" aria-label="状态">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">启用中</SelectItem>
                    <SelectItem value="disabled">已禁用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isUsersError && usersMessage ? (
              <p className="text-sm text-red-600">{usersMessage}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeEditorDialog}>
              取消
            </Button>
            <Button
              type="button"
              onClick={dialogMode === 'create-user' ? submitCreateUser : submitEditUser}
              disabled={isUsersPending}
            >
              {isUsersPending ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => {
          if (!open) {
            closeDeleteDialog();
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              删除后会移除该用户及其关联数据，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletePending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeletePending}
              onClick={submitDeleteUser}
            >
              {isDeletePending ? '删除中…' : '删除'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={logoutConfirmOpen}
        onOpenChange={(open) => {
          if (isLogoutPending) {
            return;
          }
          setLogoutConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认退出登录</AlertDialogTitle>
            <AlertDialogDescription>
              退出后将结束当前会话，并返回登录页面。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLogoutPending}>取消</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isLogoutPending}
              onClick={() => {
                setLogoutConfirmOpen(false);
                handleLogout();
              }}
            >
              {isLogoutPending ? '退出中…' : '确认退出'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
