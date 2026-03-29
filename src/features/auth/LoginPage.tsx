'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, login } from '@/lib/apiClient';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    startTransition(() => {
      void (async () => {
        try {
          await login({ password });
          window.location.assign('/');
        } catch (err) {
          if (err instanceof ApiError) {
            setErrorMessage(err.message);
            return;
          }

          setErrorMessage('登录失败，请稍后重试');
        }
      })();
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,rgba(62,110,209,0.18),transparent_42%),linear-gradient(180deg,#f7f8fb_0%,#eef2f7_100%)] text-foreground">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.42),transparent_32%,rgba(9,24,54,0.06))]" />
      <div className="absolute left-1/2 top-[18%] h-40 w-40 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(62,110,209,0.22),rgba(62,110,209,0))] blur-3xl" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <section className="rounded-[30px] border border-white/70 bg-white/86 p-6 shadow-[0_30px_80px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:p-8">
          <div className="space-y-5">
            <div className="space-y-3 text-center">
              <span className="inline-flex rounded-full border border-primary/15 bg-white/70 px-3 py-1 text-[11px] font-semibold tracking-[0.24em] text-primary">
                FEEDFUSE
              </span>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-[2.1rem]">
                  欢迎回来
                </h1>
                <p className="text-sm text-slate-500">
                  登录后继续你的 RSS 阅读与管理。
                </p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="login-password">密码</Label>
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="输入密码"
                  aria-invalid={errorMessage ? 'true' : 'false'}
                />
              </div>

              {errorMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {errorMessage}
                </p>
              ) : null}

              <Button type="submit" className="h-10 w-full" disabled={isPending}>
                {isPending ? '登录中…' : '进入 FeedFuse'}
              </Button>
            </form>

            <div className="flex items-center justify-center gap-2 pt-1 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Private workspace</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
