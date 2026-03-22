# Feed 存储上限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-subagent-driven-development (recommended) or superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为全局设置增加每个 feed 文章存储上限，并在设置保存与后续入库时自动清理超量且未收藏的旧文章。

**Architecture:** 在 `PersistedSettings.rss` 中增加固定枚举配置，由设置页统一编辑并经 `/api/settings` 保存。后端在 `articlesRepo` 中新增按 feed 与全量 feed 清理超量文章的 SQL，设置接口在上限变更时立即执行全量清理，文章新增路径在写入成功后执行单 feed 清理。

**Tech Stack:** Next.js, React, Zustand, Vitest, PostgreSQL, pg

---

### Task 1: 补设置层失败测试

**Files:**
- Modify: `src/features/settings/settingsSchema.test.ts`
- Modify: `src/store/settingsStore.test.ts`
- Modify: `src/app/api/settings/routes.test.ts`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行对应测试并确认失败**
- [ ] **Step 3: 实现最小设置层代码**
- [ ] **Step 4: 重新运行测试并确认通过**

### Task 2: 补文章清理仓库失败测试

**Files:**
- Create: `src/server/repositories/articlesRepo.retention.test.ts`
- Modify: `src/server/repositories/articlesRepo.ts`

- [ ] **Step 1: 写失败测试**
- [ ] **Step 2: 运行对应测试并确认失败**
- [ ] **Step 3: 实现最小 SQL 清理逻辑**
- [ ] **Step 4: 重新运行测试并确认通过**

### Task 3: 接入设置保存与文章新增路径

**Files:**
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/aiDigestGenerate.ts`
- Modify: `src/worker/aiDigestGenerate.test.ts`

- [ ] **Step 1: 写新增路径失败测试**
- [ ] **Step 2: 运行对应测试并确认失败**
- [ ] **Step 3: 接入设置保存与新增文章后的清理调用**
- [ ] **Step 4: 重新运行测试并确认通过**

### Task 4: 构建验证

**Files:**
- Verify: `src/types/index.ts`
- Verify: `src/features/settings/panels/RssSettingsPanel.tsx`
- Verify: `src/server/repositories/articlesRepo.ts`
- Verify: `src/app/api/settings/route.ts`
- Verify: `src/worker/index.ts`
- Verify: `src/worker/aiDigestGenerate.ts`

- [ ] **Step 1: 运行本次相关单测**
- [ ] **Step 2: 运行 `pnpm build`**
- [ ] **Step 3: 确认没有新的类型或构建错误**
