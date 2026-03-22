# Image Proxy Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-subagent-driven-development (recommended) or superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将所有图片统一改为服务端签名代理透传，不再转码、压缩或先缓冲到内存。

**Architecture:** 文章正文图、快照预览图和 feed icon 继续生成 `/api/media/image` 签名地址，但不再附带 `w/h/q`。图片代理路由保留签名校验、SSRF 校验和手动重定向跟随，改为直接流式转发上游响应，并只在 2xx 非图片内容时拒绝请求。

**Tech Stack:** Next.js App Router, TypeScript, got, Vitest

---

### Task 1: 锁定新的代理与 URL 生成行为

**Files:**
- Modify: `src/app/api/media/image/route.test.ts`
- Modify: `src/server/services/readerSnapshotService.previewImage.test.ts`

- [ ] **Step 1: 写失败测试**
  - 断言 `/api/media/image` 对带 `w/h/q` 的签名请求不再转码为 `image/webp`
  - 断言快照预览图和 feed icon 生成的代理 URL 不再包含 `w/h/q`

- [ ] **Step 2: 运行定向测试并确认 RED**
  - Run: `pnpm exec vitest run src/app/api/media/image/route.test.ts src/server/services/readerSnapshotService.previewImage.test.ts`
  - Expected: 断言仍看到 `image/webp` 或 `w/h/q`，测试失败

### Task 2: 实现流式代理与统一签名 URL

**Files:**
- Modify: `src/app/api/media/image/route.ts`
- Modify: `src/server/http/externalHttpClient.ts`
- Modify: `src/server/services/readerSnapshotService.ts`

- [ ] **Step 1: 实现流式图片抓取抽象**
  - 保留手动重定向、Referer 和 SSRF 校验
  - 去掉 `Buffer.concat` 与 `maxBytes`
  - 返回可直接用于 `Response` 的流和必要响应头

- [ ] **Step 2: 更新图片路由**
  - 去掉 `sharp` 转码与 `too_large -> 307`
  - 透传上游状态码和关键响应头
  - 保留 2xx 非图片内容的拒绝逻辑

- [ ] **Step 3: 更新预览图和 icon URL 改写**
  - 停止为快照预览图和 feed icon 传递 `w/h/q`

### Task 3: 验证

**Files:**
- Verify: `src/app/api/media/image/route.test.ts`
- Verify: `src/server/services/readerSnapshotService.previewImage.test.ts`

- [ ] **Step 1: 运行定向测试确认 GREEN**
  - Run: `pnpm exec vitest run src/app/api/media/image/route.test.ts src/server/services/readerSnapshotService.previewImage.test.ts`

- [ ] **Step 2: 运行完整构建验证**
  - Run: `pnpm build`

- [ ] **Step 3: 用真实 GIF 路由复测**
  - Run: `pnpm exec tsx -e "<route smoke check>"`
  - Expected: 返回站内代理响应，不再出现回退到原图的跨域问题
