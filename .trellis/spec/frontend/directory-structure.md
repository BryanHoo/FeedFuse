# Directory Structure

> FeedFuse 使用 Next.js 单仓实现全栈：同一仓库包含 UI、API Route、服务层与 Worker。

---

## Overview

- `src/app` 放页面与 API 入口（App Router）
- `src/features` 放业务组件与同域逻辑
- `src/components/ui` 放可复用 UI 原子组件
- `src/store` 放 Zustand 全局状态
- `src/server` 放服务端核心能力（DB、Repo、Service、Auth、Queue）
- `src/worker` 放后台任务消费逻辑

---

## Directory Layout

```text
src/
├── app/                  # 页面 + /api 路由入口
│   ├── (reader)/
│   └── api/
├── features/             # 按业务域组织的组件与 hooks
├── components/ui/        # 通用 UI 原子组件（Radix + Tailwind）
├── hooks/                # 跨业务通用 hooks
├── lib/                  # 前端 API 客户端、通用工具
├── store/                # Zustand 状态
├── server/               # 服务端分层（auth/db/http/repositories/services/rss...）
├── worker/               # 异步任务调度与执行
├── types/                # 共享类型定义
└── test/                 # 测试初始化与测试替身
```

---

## Module Organization

- 新增 UI 能力优先落在 `src/features/<domain>/`，必要时再抽到 `src/components/ui/`。
- API Route 只做「鉴权 + 参数校验 + 调用 service/repo + 返回统一响应」。
- 数据库 SQL 与持久化细节放在 `src/server/repositories/`，不要写进 route/component。
- 跨层链路遵循：`app/api/* -> server/services|repositories -> db`，前端通过 `lib/apiClient.ts` 调用 API。

---

## Naming Conventions

- 组件文件使用 `PascalCase.tsx`，如 `ReaderLayout.tsx`。
- Hook 文件使用 `useXxx.ts`，如 `useStreamingAiSummary.ts`。
- Route 固定为 `route.ts`，测试为同目录 `route.test.ts` 或 `routes.test.ts`。
- Service/Repo 使用 `xxxService.ts`、`xxxRepo.ts` 后缀。

---

## Real Examples

- 页面与客户端壳：`src/app/(reader)/ReaderApp.tsx`
- API Route 入口：`src/app/api/feeds/route.ts`
- 业务组件域：`src/features/articles/ArticleList.tsx`
- 全局状态：`src/store/appStore.ts`
- 服务层与仓储层：`src/server/services/readerSnapshotService.ts`、`src/server/repositories/articlesRepo.ts`
- 后台任务：`src/worker/index.ts`
