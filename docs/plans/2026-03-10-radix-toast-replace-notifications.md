# Radix Toast Replace Notifications Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 用 `@radix-ui/react-toast` 替换当前自研通知系统（`src/features/notifications/*`），并将业务侧调用迁移为全局 `toast(...)`；保留 `apiClient` 失败默认自动弹 toast 的行为，同时尽量保持现有样式 token 与测试断言稳定。

**Architecture:** 使用 `zustand` 存 toast 队列与行为（去重、限栈、TTL、dismiss），提供全局 `toast.*` API；通过 `ToastHost`（唯一挂载点）渲染 Radix Toast 并在 `useLayoutEffect` 中桥接 `setApiErrorNotifier(...)` 到 `toast.error(...)`。

**Tech Stack:** Next.js 16、React 19、`zustand`、`@radix-ui/react-toast`、Tailwind CSS、Vitest、Testing Library、`lucide-react`

---

## Pre-flight（建议）

- `docs/summaries/` 当前仅有 `docs/summaries/2026-03-09-streaming-summary-hook-reset.md`，与 toast/通知迁移无直接关联；无需额外对照处理。
- 本计划建议在独立 worktree 中执行，避免污染当前工作目录。

### Task 0: 创建独立 worktree（推荐）

**Step 1: 创建 worktree**

Run:

```bash
mkdir -p ../FeedFuse.worktrees
git worktree add ../FeedFuse.worktrees/radix-toast -b feat/radix-toast-notifications
```

Expected:

- `git worktree list` 包含 `../FeedFuse.worktrees/radix-toast`
- 后续所有命令在该目录执行

---

### Task 1: 添加 `@radix-ui/react-toast` 依赖

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: 安装依赖**

Run:

```bash
pnpm add @radix-ui/react-toast
```

Expected:

- `package.json` 的 `dependencies` 出现 `@radix-ui/react-toast`
- `pnpm-lock.yaml` 更新
- Command exit code = 0

**Step 2: 运行最小单测确保环境正常**

Run:

```bash
pnpm test:unit src/features/notifications/NotificationProvider.test.tsx
```

Expected:

- PASS（用于确认依赖安装未破坏 test 运行环境）

**Step 3: Commit**

Run:

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(通知): 添加 @radix-ui/react-toast 依赖" -m "- 添加 toast 迁移所需 Radix 依赖"
```

---

### Task 2: 新增 toast store（TDD：去重/限栈/默认 TTL）

**Files:**

- Create: `src/features/toast/toastStore.ts`
- Test: `src/features/toast/toastStore.test.ts`

**Step 1: 写失败测试（dedupe / max stack / error retention）**

Create `src/features/toast/toastStore.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    toastStore.getState().reset();
    vi.useRealTimers();
  });

  it('dedupes same dedupeKey within 1500ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T10:00:00.000Z'));

    const id1 = toastStore.getState().push({ tone: 'success', message: '保存成功' });
    const id2 = toastStore.getState().push({ tone: 'success', message: '保存成功' });

    expect(id2).toBe(id1);
    expect(toastStore.getState().toasts).toHaveLength(1);
  });

  it('keeps max 3 toasts and prioritizes error retention', () => {
    toastStore.getState().push({ tone: 'success', message: 'A' });
    toastStore.getState().push({ tone: 'info', message: 'B' });
    toastStore.getState().push({ tone: 'error', message: 'C' });
    toastStore.getState().push({ tone: 'success', message: 'D' });

    const messages = toastStore.getState().toasts.map((t) => t.message);
    expect(messages).toEqual(['B', 'C', 'D']);
  });

  it('applies default duration by tone when durationMs is not provided', () => {
    const id = toastStore.getState().push({ tone: 'error', message: '操作失败' });
    const item = toastStore.getState().toasts.find((t) => t.id === id);
    expect(item?.durationMs).toBe(4500);
  });
});
```

**Step 2: 运行测试确认失败**

Run:

```bash
pnpm vitest run src/features/toast/toastStore.test.ts
```

Expected:

- FAIL（`Cannot find module './toastStore'` 或导出缺失）

**Step 3: 写最小实现**

Create `src/features/toast/toastStore.ts`：

```ts
import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  dedupeKey: string;
  createdAt: number;
  durationMs: number;
}

const TTL_BY_TONE: Record<ToastTone, number> = {
  success: 1800,
  info: 2500,
  error: 4500,
};

const DEDUPE_WINDOW_MS = 1500;
const MAX_STACK = 3;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trimStack(input: ToastItem[]): ToastItem[] {
  if (input.length <= MAX_STACK) return input;
  const next = [...input];
  while (next.length > MAX_STACK) {
    const removableIndex = next.findIndex((item) => item.tone !== 'error');
    const targetIndex = removableIndex >= 0 ? removableIndex : 0;
    next.splice(targetIndex, 1);
  }
  return next;
}

type PushInput = {
  tone: ToastTone;
  message: string;
  id?: string;
  dedupeKey?: string;
  durationMs?: number;
};

type ToastState = {
  toasts: ToastItem[];
  push: (input: PushInput) => string;
  dismiss: (id?: string) => void;
  reset: () => void;
};

const lastSeenAtByKey = new Map<string, number>();

export const toastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ tone, message: rawMessage, id, dedupeKey: dedupeKeyInput, durationMs }) => {
    const message = rawMessage.trim();
    if (!message) return '';

    const now = Date.now();
    const dedupeKey = dedupeKeyInput ?? `${tone}:${message}`;

    const lastSeenAt = lastSeenAtByKey.get(dedupeKey);
    if (typeof lastSeenAt === 'number' && now - lastSeenAt <= DEDUPE_WINDOW_MS) {
      const existing = get().toasts.find((item) => item.dedupeKey === dedupeKey);
      if (existing) return existing.id;
    }

    lastSeenAtByKey.set(dedupeKey, now);

    const resolvedId = id ?? generateId();
    const nextItem: ToastItem = {
      id: resolvedId,
      tone,
      message,
      dedupeKey,
      createdAt: now,
      durationMs: typeof durationMs === 'number' ? durationMs : TTL_BY_TONE[tone],
    };

    set((state) => {
      const existingIndex = state.toasts.findIndex((item) => item.id === resolvedId);
      if (existingIndex >= 0) {
        const next = [...state.toasts];
        next[existingIndex] = { ...next[existingIndex], ...nextItem };
        return { toasts: next };
      }
      return { toasts: trimStack([...state.toasts, nextItem]) };
    });

    return resolvedId;
  },
  dismiss: (id) => {
    if (!id) {
      set({ toasts: [] });
      return;
    }
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
  reset: () => {
    lastSeenAtByKey.clear();
    set({ toasts: [] });
  },
}));
```

**Step 4: 运行测试确认通过**

Run:

```bash
pnpm vitest run src/features/toast/toastStore.test.ts
```

Expected:

- PASS

**Step 5: Commit**

Run:

```bash
git add src/features/toast/toastStore.ts src/features/toast/toastStore.test.ts
git commit -m "feat(通知): 添加 toastStore 队列与去重限栈逻辑" -m "- 添加 dedupe/max-stack/默认 TTL 的可测 store 行为"
```

---

### Task 3: 提供全局 `toast.*` API（脱离 React hook）

**Files:**

- Create: `src/features/toast/toast.ts`

**Step 1: 添加 `toast` 导出**

Create `src/features/toast/toast.ts`：

```ts
'use client';

import type { ToastTone } from './toastStore';
import { toastStore } from './toastStore';

export type ToastOptions = {
  id?: string;
  dedupeKey?: string;
  durationMs?: number;
};

function push(tone: ToastTone, message: string, options?: ToastOptions) {
  return toastStore.getState().push({
    tone,
    message,
    id: options?.id,
    dedupeKey: options?.dedupeKey,
    durationMs: options?.durationMs,
  });
}

export const toast = {
  success(message: string, options?: ToastOptions) {
    return push('success', message, options);
  },
  info(message: string, options?: ToastOptions) {
    return push('info', message, options);
  },
  error(message: string, options?: ToastOptions) {
    return push('error', message, options);
  },
  dismiss(id?: string) {
    toastStore.getState().dismiss(id);
  },
  push(input: { tone: ToastTone; message: string } & ToastOptions) {
    return push(input.tone, input.message, input);
  },
};
```

**Step 2: 运行 toastStore 测试做回归**

Run:

```bash
pnpm vitest run src/features/toast/toastStore.test.ts
```

Expected:

- PASS

**Step 3: Commit**

Run:

```bash
git add src/features/toast/toast.ts
git commit -m "feat(通知): 添加全局 toast API" -m "- 提供 toast.success/info/error/dismiss 统一调用入口"
```

---

### Task 4: 新增 `ToastHost`（Radix UI 渲染 + API 错误桥接）

**Files:**

- Create: `src/features/toast/ToastHost.tsx`
- Test: `src/features/toast/ToastHost.test.tsx`
- (Uses): `src/lib/designSystem.ts`（复用 `NOTIFICATION_VIEWPORT_CLASS_NAME`）

**Step 1: 写失败测试（Host 渲染 viewport + 触发 toast 可见）**

Create `src/features/toast/ToastHost.test.tsx`：

```tsx
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToastHost } from './ToastHost';
import { toast } from './toast';
import { toastStore } from './toastStore';

describe('ToastHost', () => {
  it('renders viewport and shows toast messages', async () => {
    toastStore.getState().reset();

    render(<ToastHost />);

    expect(screen.getByTestId('notification-viewport')).toBeInTheDocument();

    await act(async () => {
      toast.success('已保存');
    });

    expect(await screen.findByText('已保存')).toBeInTheDocument();
  });
});
```

**Step 2: 运行测试确认失败**

Run:

```bash
pnpm vitest run src/features/toast/ToastHost.test.tsx
```

Expected:

- FAIL（`ToastHost` 不存在 / 依赖缺失）

**Step 3: 写最小实现（含 `useLayoutEffect` 桥接）**

Create `src/features/toast/ToastHost.tsx`：

```tsx
'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { NOTIFICATION_VIEWPORT_CLASS_NAME } from '@/lib/designSystem';
import { cn } from '@/lib/utils';
import { clearApiErrorNotifier, setApiErrorNotifier } from '@/lib/apiErrorNotifier';
import { toast } from './toast';
import { toastStore, type ToastTone } from './toastStore';

const toneClassByTone: Record<ToastTone, string> = {
  success: 'border-success/25 bg-success/12 text-success-foreground',
  error: 'border-error/25 bg-error/12 text-error-foreground',
  info: 'border-info/20 bg-info/10 text-info-foreground',
};

const iconClassByTone: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-info',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const className = cn('h-4 w-4', iconClassByTone[tone]);
  if (tone === 'success') return <CheckCircle2 aria-hidden="true" className={className} />;
  if (tone === 'error') return <AlertCircle aria-hidden="true" className={className} />;
  return <Info aria-hidden="true" className={className} />;
}

export function ToastHost() {
  const toasts = toastStore((state) => state.toasts);
  const dismiss = toastStore((state) => state.dismiss);

  useLayoutEffect(() => {
    setApiErrorNotifier((message) => {
      toast.error(message);
    });
    return () => {
      clearApiErrorNotifier();
    };
  }, []);

  return (
    <RadixToast.Provider label="通知" swipeDirection="right">
      {toasts.map((item) => (
        <RadixToast.Root
          key={item.id}
          open
          duration={item.durationMs}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
          role={item.tone === 'error' ? 'alert' : 'status'}
          aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-md backdrop-blur-sm outline-none',
            toneClassByTone[item.tone],
          )}
        >
          <span className="mt-0.5 shrink-0">
            <ToneIcon tone={item.tone} />
          </span>
          <RadixToast.Description className="min-w-0 flex-1 text-sm leading-5">
            {item.message}
          </RadixToast.Description>
          <RadixToast.Close
            aria-label="关闭提醒"
            className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-accent/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X size={14} />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}

      <RadixToast.Viewport
        data-testid="notification-viewport"
        className={NOTIFICATION_VIEWPORT_CLASS_NAME}
      />
    </RadixToast.Provider>
  );
}
```

Notes:

- 桥接用 `useLayoutEffect`：确保在页面首次 `useEffect`（例如 ReaderApp 的首次拉取 snapshot）之前注册 `setApiErrorNotifier(...)`，降低“首个失败请求不弹 toast”的风险。

**Step 4: 运行测试确认通过**

Run:

```bash
pnpm vitest run src/features/toast/ToastHost.test.tsx
```

Expected:

- PASS

**Step 5: Commit**

Run:

```bash
git add src/features/toast/ToastHost.tsx src/features/toast/ToastHost.test.tsx
git commit -m "feat(通知): 添加 ToastHost 渲染与 API 错误桥接" -m "- 使用 Radix Toast 渲染 toast 队列\n- 桥接 apiErrorNotifier 到 toast.error"
```

---

### Task 5: 兼容层（可选但推荐）：让旧 `useNotify()` 直接转发到 `toast.*`

目的：允许先完成 UI/全局桥接，再逐步迁移业务侧调用点；同时避免大爆炸式改动导致一次 PR 太大。

**Files:**

- Modify: `src/features/notifications/useNotify.ts`
- Modify: `src/features/notifications/NotificationProvider.tsx`
- Modify: `src/features/notifications/ApiNotificationBridge.tsx`
- (No longer used): `src/features/notifications/NotificationViewport.tsx`

**Step 1: 将 `useNotify()` 改为薄封装（不再依赖 context）**

Modify `src/features/notifications/useNotify.ts`：

```ts
import { toast } from '../toast/toast';

export function useNotify() {
  return {
    success: toast.success,
    info: toast.info,
    error: toast.error,
    dismiss: toast.dismiss,
  };
}
```

**Step 2: 将 `NotificationProvider` 改为仅挂载 `ToastHost`**

Modify `src/features/notifications/NotificationProvider.tsx`：

- 删除 context、dedupe、TTL 等逻辑（这些已迁移到 `toastStore`）。
- 保留同名导出以降低迁移成本。

最小目标实现：

```tsx
'use client';

import type React from 'react';
import { ToastHost } from '../toast/ToastHost';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}
```

注意：

- 这会让现有测试 wrapper（大量 `render(<NotificationProvider>...</NotificationProvider>)`）继续工作。

**Step 3: 将 `ApiNotificationBridge` 变为 no-op（避免与 ToastHost 竞争 setApiErrorNotifier）**

Modify `src/features/notifications/ApiNotificationBridge.tsx`：

```tsx
export function ApiNotificationBridge() {
  return null;
}
```

**Step 4: 更新/替换旧的 `NotificationProvider` 单测**

当前 `src/features/notifications/NotificationProvider.test.tsx` 将不再适用（dedupe/限栈/TTL 已迁移到 `toastStore`）。

- 选择 A（推荐）：删除该测试文件，并用 `src/features/toast/toastStore.test.ts` 覆盖相同 contract（已在 Task 2 做到）
- 选择 B：改写为 `ToastHost` 或 `toastStore` 测试

Run:

```bash
pnpm test:unit src/features/notifications/NotificationProvider.test.tsx
```

Expected:

- 若删除/改写：PASS

**Step 5: Commit**

Run:

```bash
git add src/features/notifications/useNotify.ts src/features/notifications/NotificationProvider.tsx src/features/notifications/ApiNotificationBridge.tsx
git commit -m "refactor(通知): 让旧通知 API 转发到 Radix toast" -m "- 重构 useNotify/NotificationProvider 为 toast 薄封装\n- 避免重复注册 apiErrorNotifier"
```

---

### Task 6: 在 ReaderApp 中挂载 toast（并移除旧桥接组件）

如果已完成 Task 5，ReaderApp 可以继续使用 `NotificationProvider`（它内部会挂 `ToastHost`），这样 ReaderApp 的改动最小。

**Files:**

- Modify: `src/app/(reader)/ReaderApp.tsx`
- Test: `src/app/(reader)/ReaderApp.test.tsx`

**Step 1: 移除 `<ApiNotificationBridge />`（由 ToastHost 接管）**

Modify `src/app/(reader)/ReaderApp.tsx`：

- 删除 `ApiNotificationBridge` import 与 JSX

**Step 2: 运行相关测试**

Run:

```bash
pnpm test:unit src/app/(reader)/ReaderApp.test.tsx
```

Expected:

- PASS
- `renders notification viewport under reader app` 仍通过（viewport testid 保持不变）

**Step 3: Commit**

Run:

```bash
git add src/app/(reader)/ReaderApp.tsx src/app/(reader)/ReaderApp.test.tsx
git commit -m "refactor(通知): ReaderApp 切换到 ToastHost 桥接" -m "- 移除 ApiNotificationBridge 组件依赖\n- 由 ToastHost 统一接管 apiClient 错误 toast"
```

---

### Task 7: 迁移业务侧调用点到全局 `toast.*`

每个文件单独迁移并跑对应测试，避免一次改动太大。

#### Task 7.1: `ArticleList` 迁移

**Files:**

- Modify: `src/features/articles/ArticleList.tsx`
- Test: `src/features/articles/ArticleList.test.tsx`

**Step 1: 用 `toast.success(...)` 替换 `notify.success(...)`**

- 删除 `useNotify` import
- 替换为 `import { toast } from '../toast/toast'`（或相对路径按实际调整）
- 将 `const notify = useNotify();` 删除
- 把 `notify.success(...)` 改为 `toast.success(...)`

**Step 2: 运行单测**

Run:

```bash
pnpm test:unit src/features/articles/ArticleList.test.tsx
```

Expected:

- PASS（包含刷新成功、刷新失败依赖全局错误 toast 的断言）

**Step 3: Commit**

Run:

```bash
git add src/features/articles/ArticleList.tsx src/features/articles/ArticleList.test.tsx
git commit -m "refactor(通知): ArticleList 改用全局 toast" -m "- 更新刷新提示从 useNotify 迁移到 toast.*"
```

#### Task 7.2: `FeedList` 迁移

**Files:**

- Modify: `src/features/feeds/FeedList.tsx`
- Test: `src/features/feeds/FeedList.test.tsx`

Steps:

- 同 Task 7.1：将 `notify.success(...)` 改为 `toast.success(...)`

Run:

```bash
pnpm test:unit src/features/feeds/FeedList.test.tsx
```

Commit:

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "refactor(通知): FeedList 改用全局 toast" -m "- 更新订阅源操作提示从 useNotify 迁移到 toast.*"
```

#### Task 7.3: `useFeedDialogForm` 迁移

**Files:**

- Modify: `src/features/feeds/useFeedDialogForm.ts`
- Test: `src/features/feeds/AddFeedDialog.test.tsx`

Steps:

- 将 `notify.success(successMessage)` 替换为 `toast.success(successMessage)`

Run:

```bash
pnpm test:unit src/features/feeds/AddFeedDialog.test.tsx
```

Commit:

```bash
git add src/features/feeds/useFeedDialogForm.ts src/features/feeds/AddFeedDialog.test.tsx
git commit -m "refactor(通知): 订阅表单改用全局 toast" -m "- 更新添加订阅源成功提示到 toast.*"
```

#### Task 7.4: `SettingsCenterDrawer` 迁移

**Files:**

- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
- Test: `src/features/settings/SettingsCenterModal.test.tsx`（该测试覆盖 drawer/保存行为）

Steps:

- 将 `notify.success('设置已自动保存')` 改为 `toast.success('设置已自动保存')`

Run:

```bash
pnpm test:unit src/features/settings/SettingsCenterModal.test.tsx
```

Commit:

```bash
git add src/features/settings/SettingsCenterDrawer.tsx src/features/settings/SettingsCenterModal.test.tsx
git commit -m "refactor(通知): 设置中心改用全局 toast" -m "- 更新自动保存提示到 toast.*"
```

---

### Task 8: 更新 theme token 契约测试指向新的 toast UI

**Files:**

- Modify: `src/app/theme-token-usage.contract.test.ts`
- (Source): `src/features/toast/ToastHost.tsx`

**Step 1: 更新读取文件路径**

将 `NotificationViewport.tsx` 替换为 `ToastHost.tsx`（或拆分后的 toast UI 文件），继续检查：

- 包含 `border-success/25`
- 包含 `bg-info/10`
- 包含 `text-error-foreground`
- 不包含硬编码色阶（`slate|gray|amber|emerald|red-` 等）

**Step 2: 运行契约测试**

Run:

```bash
pnpm test:unit src/app/theme-token-usage.contract.test.ts
```

Expected:

- PASS

**Step 3: Commit**

Run:

```bash
git add src/app/theme-token-usage.contract.test.ts
git commit -m "test(通知): 更新 toast 主题 token 契约覆盖" -m "- 将 token 契约测试迁移到 ToastHost UI"
```

---

### Task 9: 删除旧通知实现并清理引用

当所有业务侧调用点都已迁移到 `toast.*`，且 app 不再依赖旧组件后，移除 `src/features/notifications/*`。

**Files:**

- Delete: `src/features/notifications/NotificationViewport.tsx`
- Delete: `src/features/notifications/NotificationProvider.tsx`
- Delete: `src/features/notifications/useNotify.ts`
- Delete: `src/features/notifications/ApiNotificationBridge.tsx`
- Delete (or keep if still used): `src/features/notifications/types.ts`
- Delete: `src/features/notifications/*.test.ts(x)`（按实际情况）
- Modify: 所有残留 import 的文件（用 `rg` 搜索）

**Step 1: 全量搜索残留引用**

Run:

```bash
rg -n "features/notifications|useNotify\\(|NotificationProvider|ApiNotificationBridge" src
```

Expected:

- 无输出（或仅剩注释/文档，需要进一步清理）

**Step 2: 删除文件并修复 imports**

（按搜索结果逐个清理，保持每次变更后可运行单测）

**Step 3: 跑全量单测**

Run:

```bash
pnpm test:unit
```

Expected:

- PASS

**Step 4: Commit**

Run:

```bash
git add -A
git commit -m "refactor(通知): 移除旧 notifications 实现" -m "- 删除自研通知组件与桥接逻辑\n- 统一改用 Radix Toast + toast.*"
```

---

### Task 10: 最终校验（可选）

**Step 1: 运行 lint**

Run:

```bash
pnpm lint
```

Expected:

- Exit code = 0（如有报错，仅修复与本次改动直接相关的部分）

