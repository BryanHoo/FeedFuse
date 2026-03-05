# FeedFuse

现代化 RSS 阅读器 Web 应用。

## 功能特性

- 三栏布局（订阅源、文章列表、阅读面板）
- 按分类管理订阅源（含未分类回退）
- 智能视图（全部、未读、星标）
- 阅读体验可调（字体、字号、行距）
- 浅色 / 深色 / 自动主题
- 星标收藏与自动标记已读

## 设置中心（MVP）

当前设置中心覆盖以下分组能力：

- `appearance`：主题、字号、字体、行距
- `ai`：`model` / `apiBaseUrl` / `apiKey`（默认仅支持 OpenAI 兼容 API）
- `rss`：RSS 源新增 / 编辑 / 删除 / 启停 / 链接验证 / 分类管理

说明：

- `ai.apiKey` 会存储在后端（数据库），前端不会持久化到 `localStorage`，也不会通过接口明文回传

## 共享弹窗基座

- 统一弹窗壳位于 `src/components/common/AppDialog.tsx`
- 统一抽屉壳位于 `src/components/common/AppDrawer.tsx`
- 业务弹窗通过公共壳层接入（如 `SettingsCenterModal`、`AddFeedDialog`）
- 关闭交互统一支持：Esc、遮罩点击、标题栏关闭按钮、业务取消按钮

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript
- TailwindCSS + Typography
- Zustand
- Lucide React

## 环境要求

- Node.js >= 20.19.0
- pnpm 10.x（建议配合 Corepack）

## 本地开发

```bash
pnpm install
pnpm run dev
```

默认地址：`http://127.0.0.1:9559`

说明：

- 默认 `dev` 使用 `WATCHPACK_POLLING=true + webpack`，避免本地环境下 `EMFILE` 与 Turbopack panic 导致的页面循环刷新/闪动
- 如需尝试 Turbopack，可执行 `pnpm run dev:turbo`

## 构建

```bash
pnpm run build
pnpm run start
```

## 验证

```bash
pnpm run lint
pnpm run test:unit
node scripts/verify-next-migration.mjs
```
