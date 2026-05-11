'use client';

import { useState, useTransition } from 'react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, changePassword, logout } from '@/lib/apiClient';

export default function SecuritySettingsPanel() {
  const currentPasswordLabelId = 'settings-current-password-label';
  const nextPasswordLabelId = 'settings-next-password-label';
  const confirmPasswordLabelId = 'settings-confirm-password-label';
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityMessage, setSecurityMessage] = useState('');
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
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
    <>
      <section className="space-y-5">
        <div className="rounded-lg border border-border bg-background p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">修改密码</p>
          <p className="text-xs text-muted-foreground">
            更新后会立即刷新当前登录会话。
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label id={currentPasswordLabelId}>当前密码</Label>
            <Input
              id="settings-current-password"
              type="password"
              autoComplete="current-password"
              aria-labelledby={currentPasswordLabelId}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              placeholder="输入当前密码"
            />
          </div>
          <div className="space-y-2">
            <Label id={nextPasswordLabelId}>新密码</Label>
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
            <Label id={confirmPasswordLabelId}>确认新密码</Label>
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

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {securityMessage ? (
            <p className={isSecurityError ? 'text-sm text-red-600' : 'text-sm text-muted-foreground'}>
              {securityMessage}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={submitPasswordChange}
            disabled={isPasswordPending}
          >
            {isPasswordPending ? '更新中…' : '更新密码'}
          </Button>
        </div>
      </div>

        <div className="rounded-lg border border-border bg-background p-4">
        {/* 将退出登录独立为单独模块，避免与修改密码操作混淆。 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">退出登录</p>
            <p className="text-xs text-muted-foreground">退出后将返回登录页面。</p>
          </div>
          <Button
            type="button"
            variant="destructive"
            size="compact"
            onClick={() => {
              // 危险操作先二次确认，确认后再真正调用退出接口。
              setLogoutConfirmOpen(true);
            }}
            disabled={isLogoutPending}
          >
            {isLogoutPending ? '退出中…' : '退出登录'}
          </Button>
        </div>
        </div>
      </section>

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
