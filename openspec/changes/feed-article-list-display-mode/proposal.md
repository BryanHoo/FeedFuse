# Feed Article Display Mode Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 在具体 RSS 源视图中，为中栏文章支持 `card/list` 切换，并按 `feed` 维度持久化。  
**Architecture:** 在 `feeds` 表新增 `article_list_display_mode` 字段，复用现有 `feedsRepo -> /api/feeds -> /api/reader/snapshot -> useAppStore -> ArticleList` 数据链路；聚合视图 (`all/unread/starred`) 始终强制 `card`。  
**Tech Stack:** Next.js 16, React 19, Zustand, Zod, PostgreSQL, Vitest

---

## Why

当前 `ArticleList` 只有卡片样式，无法满足用户在信息密度与浏览速度之间切换的需求。现在新增按 `feed` 维度保存的显示模式，可在不影响聚合视图的前提下提升阅读效率与一致性体验。

## What Changes

- 在 `feeds` 增加 `article_list_display_mode`（`card | list`，默认 `card`）并加约束。
- 扩展 `feedsRepo`、`PATCH /api/feeds/[id]`、`reader snapshot` 以读写该字段。
- 扩展前端 `Feed` 与 `apiClient` 映射，支持切换时调用 `patchFeed` 保存。
- `ArticleList` 新增切换按钮（刷新按钮左侧，仅 feed 视图显示）。
- `list` 模式改为“左标题 + 右时间”，保留日期分组与未读标记。
- 请求失败时乐观更新回滚并通知。

## Capabilities

### New Capabilities

- `feed-article-list-display-mode`: 支持按 feed 持久化中栏 `card/list` 显示模式，并定义聚合视图固定 `card` 行为。

### Modified Capabilities

- _None_

## Impact

- 数据库：
  - `src/server/db/migrations/0008_feed_article_list_display_mode.sql`（新增）
- 后端：
  - `src/server/repositories/feedsRepo.ts`
  - `src/app/api/feeds/[id]/route.ts`
  - `src/server/services/readerSnapshotService.ts`
- 前端：
  - `src/types/index.ts`
  - `src/lib/apiClient.ts`
  - `src/store/appStore.ts`
  - `src/features/articles/ArticleList.tsx`
- 测试：
  - migration / repository / API / ArticleList 单测扩展
