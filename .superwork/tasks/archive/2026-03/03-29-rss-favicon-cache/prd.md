# 修复 RSS favicon 获取并缓存

## Goal

修复 RSS 源 favicon 在当前实现中依赖第三方 Google S2 地址而导致的加载失败问题，并将 favicon 改为由系统内部路由提供、由服务端按需抓取并缓存，避免前端每次渲染都直接请求外部站点。

## Root Cause

- 当前 `deriveFeedIconUrl()` 只会把 `siteUrl` 转成 Google S2 favicon URL，并不会真正发现或缓存站点 favicon。
- `feeds.icon_url` 持久化的是第三方外链，一旦第三方不可用，前端只能拿到一个失效地址。
- 系统当前没有 favicon 的本地缓存层，也没有内部稳定资源路由。

## In Scope

- 为 RSS feed 提供内部 favicon 访问路由。
- 为 favicon 增加数据库缓存表，缓存图片二进制、来源地址和基础元数据。
- 在首次访问或缓存失效时，从站点抓取 favicon 并写入缓存。
- 将 RSS feed 的 `iconUrl` 统一切换为内部路由地址。
- 在 `siteUrl` 变更时清理旧缓存，确保不会继续返回旧站点图标。
- 为新增链路补充迁移、路由、服务和回归测试。

## Out of Scope

- 不实现后台定时刷新 favicon。
- 不增加独立的对象存储或文件系统存储。
- 不修改 AI digest feed 的图标策略。

## Constraints

- 不能让 favicon 抓取失败阻塞 feed 的创建或更新。
- 新方案必须兼容现有前端 `iconUrl` 字段，不新增前端字段契约。
- 抓取必须沿用现有外部请求安全边界，避免引入 SSRF 回归。
- 对已有 RSS feed 需要提供可迁移的内部图标地址，不能只修复新建数据。

## Cross-Layer Contract

- RSS feed 对外暴露的 `iconUrl` 改为 `/api/feeds/:id/favicon`。
- 新增缓存表持久化 favicon 内容与来源元数据。
- `GET /api/feeds/:id/favicon`：
  - 命中缓存时直接返回缓存图片。
  - 未命中时按 `siteUrl` 懒加载抓取并写入缓存。
  - 无 `siteUrl`、feed 不存在或抓取失败时返回非成功响应，不返回伪造图片。

## Acceptance Criteria

- [ ] 已有和新建的 RSS feed 在存在 `siteUrl` 时都返回内部 `iconUrl`，不再依赖 Google S2。
- [ ] 首次请求 favicon 时服务端可按 `siteUrl` 发现并缓存 favicon，后续请求直接命中本地缓存。
- [ ] `siteUrl` 更新或清空后，旧 favicon 缓存会被清理，避免串用旧图标。
- [ ] favicon 抓取失败不会影响 feed 创建、更新、导入等主流程。
- [ ] 相关路由、服务、迁移测试通过。

## Risks / Edge Cases

- 站点可能没有 `link[rel*=icon]`，需要回退到 `/favicon.ico`。
- HTML 中 favicon 地址可能是相对路径、协议相对路径或包含 HTML entity。
- 缓存图片可能是 `image/x-icon`、`image/png`、`image/svg+xml` 等多种类型。
- 旧数据里的 `icon_url` 可能已经是 Google S2 外链，需要迁移到内部路由。
- `readerSnapshotService` 目前会重写外部图片 URL，需要避免对内部 favicon 路由再次签名代理。

## Relevant Specs

- `.superwork/spec/backend/directory-structure.md`: 约束 route / service / repository 分层职责。
- `.superwork/spec/backend/api-guidelines.md`: 新增 API route 的返回和校验规范。
- `.superwork/spec/backend/type-safety.md`: 外部输入与内部契约的类型边界。
- `.superwork/spec/backend/quality-guidelines.md`: 行为改动必须补测试。
- `.superwork/spec/backend/data-access-guidelines.md`: favicon 缓存表与 repository 设计规范。
- `.superwork/spec/guides/cross-layer-thinking-guide.md`: 明确 feed -> cache -> route -> frontend 的数据流。
- `.superwork/spec/guides/code-reuse-thinking-guide.md`: 复用现有外部请求与图片代理能力，避免重复实现。

## Research Summary

### Relevant Specs

- `.superwork/spec/backend/directory-structure.md`: favicon 访问入口应放在 `src/app/api`，抓取与缓存编排应放在 `src/server/services` / `src/server/rss` / `src/server/repositories`。
- `.superwork/spec/backend/api-guidelines.md`: 新 route 要保持 Node runtime，并用清晰的错误响应。
- `.superwork/spec/backend/data-access-guidelines.md`: 新缓存表需要 repository 边界，不应在 route 内直接写 SQL。

### Code Patterns Found

- 图片代理与外部图片抓取：`src/app/api/media/image/route.ts`、`src/server/http/externalHttpClient.ts`
- feed 创建/更新跨 repository 编排：`src/server/services/feedCategoryLifecycleService.ts`
- feed 图标当前读取路径：`src/server/services/readerSnapshotService.ts`

### Files To Modify

- `src/server/db/migrations/*`: 增加 favicon 缓存表并回填 `feeds.icon_url`
- `src/server/repositories/feedsRepo.ts`: 查询 feed favicon 路由与 `siteUrl` 读取支持
- `src/server/repositories/feedFaviconsRepo.ts`: 新增 favicon 缓存 repository
- `src/server/services/feedCategoryLifecycleService.ts`: 创建/更新 feed 时切换内部 `iconUrl` 并清理旧缓存
- `src/server/services/feedFaviconService.ts`: 懒加载抓取并缓存 favicon
- `src/server/rss/*`: favicon 发现与抓取逻辑
- `src/app/api/feeds/[id]/favicon/route.ts`: 提供内部 favicon 资源
- `src/server/services/readerSnapshotService.ts`: 内部 favicon 路由不再走外部图片代理重写
- `src/app/api/feeds/routes.test.ts`、`src/server/services/opmlService.test.ts` 等：更新旧的 Google S2 断言

## Implementation Plan

1. 先补或更新测试，锁定 RSS feed `iconUrl` 改为内部 favicon 路由，以及 favicon 路由的缓存命中/懒加载行为。
2. 添加数据库迁移和 repository，为 favicon 缓存提供持久化表与查询/清理能力，并回填已有 feed 的内部 `iconUrl`。
3. 实现 favicon 发现、抓取、缓存服务与新路由；在 feed 创建/更新链路中改为写入内部 `iconUrl`。
4. 调整读取链路，避免内部 favicon URL 被再次外部代理重写。
5. 运行 targeted tests、`pnpm lint`、`pnpm type-check`，修复回归。

## File Plan

- Modify: `src/server/repositories/feedsRepo.ts`
- Add: `src/server/repositories/feedFaviconsRepo.ts`
- Add: `src/server/services/feedFaviconService.ts`
- Add: `src/server/rss/discoverFeedFavicon.ts`
- Add: `src/app/api/feeds/[id]/favicon/route.ts`
- Modify: `src/server/services/feedCategoryLifecycleService.ts`
- Modify: `src/server/services/readerSnapshotService.ts`
- Add: `src/server/db/migrations/0027_feed_favicons.sql`
- Add: `src/server/db/migrations/feedFaviconsMigration.test.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Modify: `src/server/services/opmlService.test.ts`

## Verification

- Targeted test: `pnpm test:unit src/app/api/feeds/routes.test.ts`
- Targeted test: `pnpm test:unit src/app/api/feeds/[id]/favicon/route.test.ts`
- Targeted test: `pnpm test:unit src/server/services/opmlService.test.ts`
- Targeted test: `pnpm test:unit src/server/services/feedCategoryLifecycleService.test.ts`
- Targeted test: `pnpm test:unit src/server/db/migrations/feedFaviconsMigration.test.ts`
- Package checks: `pnpm lint`
- Package checks: `pnpm type-check`
