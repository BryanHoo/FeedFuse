'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, changePassword, logout } from '@/lib/apiClient';

export default function SecuritySettingsPanel() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();

  const resetSecurityForm = () => {
    setCurrentPassword('');
    setNextPassword('');
    setConfirmPassword('');
  };

  const submitPasswordChange = () => {
    setSecurityMessage('');
    setIsSecurityError(false);

    if (!currentPassword.trim()) {
      setIsSecurityError(true);
      setSecurityMessage('请输入当前密码');
      return;
    }

    if (nextPassword.trim().length < 8) {
      setIsSecurityError(true);
      setSecurityMessage('新密码至少需要 8 位');
      return;
    }

    if (nextPassword !== confirmPassword) {
      setIsSecurityError(true);
      setSecurityMessage('两次输入的新密码不一致');
      return;
    }

    startPasswordTransition(() => {
      void (async () => {
        try {
          await changePassword(
            {
              currentPassword,
              nextPassword,
            },
            { notifyOnError: false, redirectOnUnauthorized: false },
          );
          resetSecurityForm();
          setIsSecurityError(false);
          setSecurityMessage('密码已更新');
        } catch (err) {
          setIsSecurityError(true);
          if (err instanceof ApiError) {
            setSecurityMessage(err.message);
            return;
          }

          setSecurityMessage('修改密码失败，请稍后重试');
        }
      })();
    });
  };

  const handleLogout = () => {
    setSecurityMessage('');

    startLogoutTransition(() => {
      void (async () => {
        try {
          await logout({ notifyOnError: false, redirectOnUnauthorized: false });
        } finally {
          window.location.assign('/login');
        }
      })();
    });
  };

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">账号安全</p>
            <p className="text-xs text-muted-foreground">
              单独管理登录密码与当前会话，和阅读、AI 设置分开。
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            当前已登录
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">修改密码</p>
            <p className="text-xs text-muted-foreground">
              更新后会立即刷新当前登录会话。
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="compact"
            onClick={handleLogout}
            disabled={isLogoutPending}
          >
            {isLogoutPending ? '退出中…' : '退出登录'}
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="settings-current-password">当前密码</Label>
            <Input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="输入当前密码"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-next-password">新密码</Label>
            <Input
              id="settings-next-password"
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              placeholder="至少 8 位"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-confirm-password">确认新密码</Label>
            <Input
              id="settings-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入新密码"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={isSecurityError ? 'text-sm text-red-600' : 'text-sm text-muted-foreground'}>
            {securityMessage || '建议使用仅自己持有的高强度密码。'}
          </p>
          <Button
            type="button"
            onClick={submitPasswordChange}
            disabled={isPasswordPending}
          >
            {isPasswordPending ? '更新中…' : '更新密码'}
          </Button>
        </div>
      </div>
    </section>
  );
}
