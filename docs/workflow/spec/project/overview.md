# 项目总览

## 仓库形态

- 模式：`single`
- 技术栈：Next.js 16 App Router、React 19、TypeScript 5.9、Tailwind CSS 4、PostgreSQL 16、`pg-boss`
- 运行形态：同一仓库同时包含前端界面、API 路由、服务端领域逻辑和后台 `worker`

## 这个项目在做什么

FeedFuse 是一个自托管 RSS 阅读器，把 RSS 订阅、全文抓取、AI 摘要、标题/正文翻译和 `AI解读` 汇总放到同一个阅读工作台里。核心目标不是推荐内容，而是让用户更稳定地完成“订阅 -> 阅读 -> 理解 -> 汇总”这一条链路。

## 主要架构边界

- `src/app`
  Next.js App Router 入口。页面路由、`/api` 路由、全局布局都在这里。
- `src/features`
  面向业务能力的前端实现，按阅读、订阅源、设置、通知等领域拆分。
- `src/components/ui`
  共享 UI 原语和 Radix 封装，供 `features` 复用。
- `src/store`
  基于 Zustand 的全局客户端状态，当前以 `appStore` 和 `settingsStore` 为核心。
- `src/lib`
  浏览器侧公共工具、API client、视图/通知等跨 feature 复用逻辑。
- `src/server`
  服务端领域层，包含认证、数据库、仓储、服务、日志、队列、RSS、AI、全文抓取等实现。
- `src/worker`
  独立后台任务入口，消费 `pg-boss` 队列，处理抓取、过滤、摘要、翻译、`AI解读` 等异步任务。

## 关键入口

- Web 入口：`src/app/layout.tsx`
- 阅读页入口：`src/app/(reader)/page.tsx`
- API 入口：`src/app/api/**/route.ts`
- 后台任务入口：`src/worker/index.ts`
- 数据库迁移入口：`scripts/db/migrate.mjs`
- 核心客户端 API 封装：`src/lib/apiClient.ts`
- 核心全局状态：`src/store/appStore.ts`、`src/store/settingsStore.ts`

## 跨层共享约束

- API 响应统一走 `src/server/http/apiResponse.ts` 的 envelope：成功返回 `{ ok: true, data }`，失败返回 `{ ok: false, error }`。
- 服务端错误优先使用 `src/server/http/errors.ts` 中的 `AppError` 子类，不直接把原始异常暴露给前端。
- 前端读取 API 时优先复用 `src/lib/apiClient.ts`，不要在组件里直接写 `fetch`。
- 配置类数据先经过 `src/features/settings/settingsSchema.ts` 归一化，再进入 store、API 或 worker。
- 数据库访问优先经 `src/server/repositories/*`，跨多表写入或带业务规则的流程放到 `src/server/services/*`。

## 进入实现前应先读

1. `docs/workflow/spec/project/commands.md`
2. `docs/workflow/spec/guides/index.md`
3. 根据任务选择 `docs/workflow/spec/backend/index.md` 或 `docs/workflow/spec/frontend/index.md`
4. 领域名词不明确时补读 `docs/workflow/spec/project/glossary.md`
