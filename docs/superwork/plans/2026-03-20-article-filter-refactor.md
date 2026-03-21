# 文章过滤重构与持久化状态链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-subagent-driven-development (recommended) or superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将文章过滤从 Reader 临时关键词跳过，升级为覆盖入库、全文抓取、过滤持久化、Reader 展示和 AI 解读候选筛选的一条统一链路。

**Architecture:** 以数据库中的 `articles.filter_status / is_filtered / filtered_by` 作为单一事实来源。新文章必须在 `insertArticleIgnoreDuplicate(...)` 时原子写成 `pending`，再通过独立 `article.filter` 队列任务完成关键词预过滤、可选全文抓取、AI 过滤和自动摘要/翻译触发。为满足“配置修改只影响之后新文章”，`article.filter` job payload 在入库/投递时冻结过滤配置与相关 feed 开关，worker 不再读取最新 UI 过滤设置重算旧文章。Reader、未读统计、文章详情和 AI digest 候选统一消费这组持久化字段，前端只负责切换单 feed 的 `includeFiltered` 展示状态，不再自行计算过滤结果。

**Canonical Visibility Rule:** 默认可见、可计入未读、可进入 AI digest 候选的文章状态统一为 `filter_status in ('passed', 'error')`；默认隐藏的状态统一为 `pending` 和 `filtered`。只有单个 RSS feed 显式开启 `includeFiltered` 时，Reader 才额外展示 `filtered`，但 `pending` 永远不可见。

**Tech Stack:** Next.js Route Handlers, TypeScript, Zustand, pg, pg-boss, Vitest, pnpm

---

## Scope Check

这个 spec 横跨数据库、worker、Reader API、前端状态和设置迁移，但它们都围绕同一条“新文章入库后如何被过滤并决定是否进入 Reader/AI digest”的链路，拆成多个独立计划会让状态机和迁移约束分散，反而更容易漏掉回归。因此保持单计划执行，但按“数据模型 -> 队列链路 -> 查询契约 -> 前端交互 -> 清理旧实现”分任务推进。

## Reusable Constraints

- 来自 `docs/summaries/2026-03-11-reader-background-refresh-overwrites-foreground-view.md`
  - `loadSnapshot({ view })` 只能改写当前前台 view 的 `articles`，后台 view 只能更新缓存，不能串改前台列表。
- 来自 `docs/summaries/2026-03-12-reader-visible-refresh-resets-selected-article-detail.md`
  - snapshot 刷新时必须保留当前文章的详情字段，不能因为切换“查看已过滤文章”或自动刷新而清空右栏正文与 AI 结果。
- 来自 spec 本身
  - 修改过滤配置后不回刷历史文章，所以设置保存后不能再因为关键词变化而强制重拉当前 snapshot 以重算历史列表。
  - 不新增浏览器自动化测试。
  - 完成前必须运行 `pnpm build`。

## Planned File Structure

- Create: `src/server/db/migrations/0023_article_filtering.sql`
  - 为 `articles` 增加过滤状态字段与索引；为 `feeds` 增加 `full_text_on_fetch_enabled`。
- Create: `src/server/db/migrations/articleFilteringMigration.test.ts`
  - 锁定 migration 关键字段、默认值和索引存在。
- Create: `src/server/services/articleFilterService.ts`
  - 封装关键词预过滤、全文输入选择、AI 过滤合并规则和最终写库结果。
- Create: `src/server/services/articleFilterService.test.ts`
  - 覆盖状态机、错误回退和 `filtered_by` 合并逻辑。
- Create: `src/server/ai/articleFilterJudge.ts`
  - 封装 AI 提示词过滤的 prompt 构造、模型调用、结果解析与失败映射。
- Create: `src/server/ai/articleFilterJudge.test.ts`
  - 锁定 AI 过滤请求/响应协议、失败回退和依赖注入。
- Create: `src/server/repositories/articlesRepo.filtering.test.ts`
  - 锁定文章过滤字段的 insert/select/update/unread SQL 语义。
- Modify: `src/worker/aiDigestGenerate.test.ts`
  - 锁定 AI digest 产出的文章不会落成 `pending`。
- Create: `src/worker/articleFilterWorker.ts`
  - 封装 `article.filter` worker 的 orchestration，复用 `fetchFulltextAndStore`、`enqueueAutoAiTriggersOnFetch`、`runArticleTaskWithStatus`，并只消费入队时冻结的过滤配置快照。
- Create: `src/worker/articleFilterWorker.test.ts`
  - 覆盖 `pending -> filtered/passed/error`、全文抓取回退和“只在未过滤时触发自动摘要/翻译”。
- Modify: `src/server/repositories/articlesRepo.ts`
  - 在 `ArticleRow`、`insertArticleIgnoreDuplicate`、`getArticleById`、`markAllRead` 及新增 update helpers 中接入过滤字段，并确保新文章原子写入 `pending`。
- Modify: `src/server/repositories/feedsRepo.ts`
  - 贯通 `fullTextOnFetchEnabled` 的查询、创建、更新与返回 DTO。
- Modify: `src/server/repositories/feedsRepo.fulltextOnOpen.test.ts`
  - 扩充为同时锁定 `fullTextOnOpenEnabled` 和 `fullTextOnFetchEnabled`。
- Modify: `src/server/repositories/aiDigestRepo.ts`
  - 候选查询排除 `pending` 和 `filtered`。
- Modify: `src/server/repositories/aiDigestRepo.test.ts`
  - 锁定 AI digest 候选查询过滤条件。
- Modify: `src/server/services/readerSnapshotService.ts`
  - 去掉运行时关键词过滤，改为数据库过滤条件；新增 `includeFiltered` 和 DTO 过滤字段。
- Modify: `src/server/services/readerSnapshotService.test.ts`
  - 锁定 `includeFiltered`、聚合视图限制和查询 where 条件。
- Modify: `src/server/services/readerSnapshotService.keywordFilter.test.ts`
  - 删除或替换为新的 `filterStatus` 行为测试。
- Modify: `src/app/api/reader/snapshot/route.ts`
  - 解析 `includeFiltered` 查询参数。
- Modify: `src/app/api/reader/snapshot/route.test.ts`
  - 覆盖 `includeFiltered` 参数透传和响应字段。
- Modify: `src/app/api/articles/[id]/route.ts`
  - 文章详情返回过滤字段。
- Modify: `src/app/api/articles/routes.test.ts`
  - 锁定详情接口包含 `filterStatus`、`isFiltered`、`filteredBy`。
- Modify: `src/app/api/feeds/route.ts`
  - `POST /api/feeds` 接收 `fullTextOnFetchEnabled`。
- Modify: `src/app/api/feeds/[id]/route.ts`
  - `PATCH /api/feeds/:id` 接收 `fullTextOnFetchEnabled`；删除 feed 时不再清理 `feedKeywordsByFeedId`。
- Modify: `src/app/api/feeds/routes.test.ts`
  - 覆盖 feed 新字段与删除 feed 不再碰 settings 的行为。
- Modify: `src/server/services/feedCategoryLifecycleService.ts`
  - 贯通 `fullTextOnFetchEnabled`。
- Modify: `src/server/queue/jobs.ts`
  - 新增 `JOB_ARTICLE_FILTER = 'article.filter'`。
- Modify: `src/server/queue/jobs.test.ts`
  - 锁定新 job 常量。
- Modify: `src/server/queue/contracts.ts`
  - 定义 `article.filter` 的 queue/worker/send 规则。
- Modify: `src/server/queue/contracts.test.ts`
  - 锁定 `article.filter` 的 singleton 和 retry 配置。
- Modify: `src/server/queue/bootstrap.test.ts`
  - 断言启动时创建 `article.filter` 队列。
- Modify: `src/worker/index.ts`
  - 抓取后只 enqueue `article.filter`；不再直接 enqueue 自动摘要、正文翻译或标题翻译。
- Modify: `src/worker/workerRegistry.test.ts`
  - 锁定新增 worker 注册。
- Modify: `src/worker/autoAiTriggers.ts`
  - 仅保留“文章通过过滤后再触发”的职责，必要时收窄入参。
- Modify: `src/worker/autoAiTriggers.test.ts`
  - 锁定触发前置条件。
- Modify: `src/features/settings/settingsSchema.ts`
  - 将 `articleKeywordFilter` 迁移为 `articleFilter.keyword/ai`，保留旧全局关键词迁移，并在中间态提供兼容读取层，直到 Reader/旧 route 完成迁移后再彻底删除旧结构。
- Modify: `src/features/settings/settingsSchema.test.ts`
  - 锁定新默认值、旧结构迁移和 feed 级关键词废弃。
- Modify: `src/types/index.ts`
  - 更新 `Feed`、`Article`、`RssSettings` 相关类型。
- Modify: `src/lib/apiClient.ts`
  - 贯通 `includeFiltered`、新 feed 字段和文章过滤 DTO。
- Modify: `src/store/settingsStore.test.ts`
  - 锁定新 settings 结构可保存。
- Modify: `src/store/appStore.ts`
  - 新增 `showFilteredByFeedId`，按 feed 透传 `includeFiltered`，并保持 per-view cache/detail 稳定。
- Modify: `src/store/appStore.test.ts`
  - 锁定“切换查看已过滤文章只影响单 feed”“snapshot 刷新不丢详情”。
- Modify: `src/features/settings/panels/RssSettingsPanel.tsx`
  - 新增全局关键词过滤和 AI 过滤提示词配置 UI。
- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
  - 去掉基于关键词变化的 snapshot reload 逻辑。
- Modify: `src/features/feeds/FeedFulltextPolicyDialog.tsx`
  - 增加 `fullTextOnFetchEnabled` 开关。
- Modify: `src/features/feeds/FeedPolicyDialogs.test.tsx`
  - 锁定全文策略对话框提交两个 switch。
- Modify: `src/features/feeds/FeedList.tsx`
  - 将“配置关键词过滤”替换为“查看已过滤文章 / 隐藏已过滤文章”。
- Modify: `src/features/feeds/FeedList.test.tsx`
  - 锁定 RSS feed 菜单项切换、AI digest feed 不展示该入口。
- Modify: `src/features/articles/ArticleList.tsx`
  - 渲染 `已过滤` 标记并保持可点击；请求刷新时带上 per-feed `includeFiltered`。
- Modify: `src/features/articles/ArticleList.test.tsx`
  - 锁定 badge、单 feed 展示和聚合视图不展示 filtered。
- Modify: `src/features/articles/ArticleView.tsx`
  - 为详情页增加轻量 `已过滤` 状态标记。
- Delete: `src/features/feeds/FeedKeywordFilterDialog.tsx`
- Delete: `src/features/feeds/FeedKeywordFilterDialog.test.tsx`
- Delete: `src/app/api/feeds/[id]/keyword-filter/route.ts`
- Delete: `src/app/api/feeds/[id]/keyword-filter/route.test.ts`

## Implementation Notes

- 先按 `@superwork-test-driven-development` 执行每个任务，先写失败测试再做最小实现。
- 收尾前按 `@superwork-verification-before-completion` 执行目标测试和 `pnpm build`。
- 只做单元/集成测试，不补浏览器自动化。

### Task 1: 数据模型与 migration 骨架

**Files:**
- Create: `src/server/db/migrations/0023_article_filtering.sql`
- Create: `src/server/db/migrations/articleFilteringMigration.test.ts`
- Test: `src/server/db/migrations/articleFilteringMigration.test.ts`

- [ ] **Step 1: 写 migration 测试**

  在 `src/server/db/migrations/articleFilteringMigration.test.ts` 断言新增 SQL 同时包含：
  - `articles.filter_status`
  - `articles.is_filtered`
  - `articles.filtered_by`
  - `articles.filter_evaluated_at`
  - `articles.filter_error_message`
  - `feeds.full_text_on_fetch_enabled`
  - `articles_filter_status_check`
  - `(feed_id, is_filtered, published_at desc, id desc)` 相关索引

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/server/db/migrations/articleFilteringMigration.test.ts`
  Expected: FAIL，缺少 `0023_article_filtering.sql` 或断言字段不存在。

- [ ] **Step 3: 编写 migration**

  在 `0023_article_filtering.sql` 中：
  - 给 `articles` 增加过滤字段，历史数据默认初始化为 `passed/false/{}`。
  - 给 `feeds` 增加 `full_text_on_fetch_enabled boolean not null default false`。
  - 建立 `filter_status` check 和索引。
  - 保持 migration 幂等，使用 `add column if not exists` / `create index if not exists`。
  - 不把新文章依赖的默认值设计成 `passed`；运行时 insert 仍需显式写 `pending`。

- [ ] **Step 4: 回跑 migration 测试**

  Run: `pnpm test:unit src/server/db/migrations/articleFilteringMigration.test.ts`
  Expected: PASS。

### Task 2: settings 结构迁移为全局 `articleFilter`

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/settings/settingsSchema.ts`
- Modify: `src/features/settings/settingsSchema.test.ts`
- Modify: `src/store/settingsStore.test.ts`
- Modify: `src/features/settings/panels/RssSettingsPanel.tsx`
- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
- Test: `src/features/settings/settingsSchema.test.ts`
- Test: `src/store/settingsStore.test.ts`

- [ ] **Step 1: 写 settings 失败测试**

  在 `settingsSchema.test.ts` 新增用例，断言：
  - 默认结构变为 `rss.articleFilter.keyword.enabled/keywords` 与 `rss.articleFilter.ai.enabled/prompt`
  - 旧 `articleKeywordFilter.globalKeywords` 会迁移到 `articleFilter.keyword.keywords`
  - 旧 `feedKeywordsByFeedId` 不再保留

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/features/settings/settingsSchema.test.ts`
  Expected: FAIL，当前 schema 仍产出 `articleKeywordFilter` 和 `feedKeywordsByFeedId`。

- [ ] **Step 3: 更新类型与 schema**

  在 `src/types/index.ts` 和 `settingsSchema.ts`：
  - 新增 `ArticleFilterSettings`
  - 迁移并规范化关键词列表与 AI prompt
  - 兼容旧全局关键词输入
  - 中间态先保留一个兼容读取层，确保 `readerSnapshotService`、旧 feed route 等调用方在 Task 6/Task 9 迁移前仍可编译运行

- [ ] **Step 4: 更新设置面板与保存测试**

  在 `RssSettingsPanel.tsx`：
  - 继续保留全局关键词输入区，但绑定到新结构
  - 增加 AI 过滤开关与 prompt `Textarea`

  在 `SettingsCenterDrawer.tsx`：
  - 删除 `pendingKeywordReloadRef` 一类“保存后重拉 snapshot 重算历史过滤”的逻辑

- [ ] **Step 5: 回跑 settings 测试**

  Run: `pnpm test:unit src/features/settings/settingsSchema.test.ts src/store/settingsStore.test.ts`
  Expected: PASS。

### Task 3: feed 配置链路增加 `fullTextOnFetchEnabled`

**Files:**
- Modify: `src/server/repositories/feedsRepo.ts`
- Modify: `src/server/repositories/feedsRepo.fulltextOnOpen.test.ts`
- Modify: `src/server/services/feedCategoryLifecycleService.ts`
- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Modify: `src/lib/apiClient.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/features/feeds/FeedFulltextPolicyDialog.tsx`
- Modify: `src/features/feeds/FeedPolicyDialogs.test.tsx`
- Test: `src/server/repositories/feedsRepo.fulltextOnOpen.test.ts`
- Test: `src/app/api/feeds/routes.test.ts`

- [ ] **Step 1: 写 feed 配置失败测试**

  扩展现有 repo/API 测试，断言 `list/create/update feed` 和 `/api/feeds` `POST/PATCH` 都会收发 `fullTextOnFetchEnabled`。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/server/repositories/feedsRepo.fulltextOnOpen.test.ts src/app/api/feeds/routes.test.ts`
  Expected: FAIL，返回 DTO 与 schema 里还没有 `fullTextOnFetchEnabled`。

- [ ] **Step 3: 打通后端与客户端 DTO**

  在 repo/service/api/apiClient/store 中统一新增 `fullTextOnFetchEnabled` 字段，并确保 create/update 时默认值为 `false`。

- [ ] **Step 4: 更新全文抓取配置对话框**

  在 `FeedFulltextPolicyDialog.tsx` 增加第二个 `Switch`：
  - `打开文章时自动抓取全文`
  - `入库时自动抓取全文`

  文案要明确两者职责不同，避免与 spec 冲突。

- [ ] **Step 5: 补 UI 对话框测试**

  在 `FeedPolicyDialogs.test.tsx` 增加断言，确认全文策略对话框会把两个开关一起提交给 `onSubmit(...)`。

- [ ] **Step 6: 回跑 feed 配置测试**

  Run: `pnpm test:unit src/server/repositories/feedsRepo.fulltextOnOpen.test.ts src/app/api/feeds/routes.test.ts src/features/feeds/FeedPolicyDialogs.test.tsx`
  Expected: PASS。

### Task 4: 建立文章过滤持久化仓储与状态机服务

**Files:**
- Modify: `src/server/repositories/articlesRepo.ts`
- Create: `src/server/repositories/articlesRepo.filtering.test.ts`
- Create: `src/server/services/articleFilterService.ts`
- Create: `src/server/services/articleFilterService.test.ts`
- Create: `src/server/ai/articleFilterJudge.ts`
- Create: `src/server/ai/articleFilterJudge.test.ts`
- Modify: `src/worker/aiDigestGenerate.test.ts`
- Modify: `src/app/api/articles/[id]/route.ts`
- Modify: `src/app/api/articles/routes.test.ts`
- Modify: `src/types/index.ts`
- Modify: `src/lib/apiClient.ts`
- Test: `src/server/services/articleFilterService.test.ts`
- Test: `src/app/api/articles/routes.test.ts`

- [ ] **Step 1: 写状态机失败测试**

  在 `articleFilterService.test.ts` 覆盖：
  - 标题+摘要关键词预过滤命中后直接 `filtered`
  - 有全文时基于全文再次执行关键词过滤
  - 仅 AI 命中 -> `filtered`
  - AI 失败且关键词未命中 -> `error`
  - 全文抓取失败 -> 回退标题+摘要继续过滤

  在 `articleFilterJudge.test.ts` 覆盖：
  - AI prompt 拼装包含全局 prompt 与文章输入
  - 模型返回“过滤/不过滤”时能被稳定解析
  - 请求失败、超时或无效返回时映射为可由上层写入 `error` 的失败结果

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/server/services/articleFilterService.test.ts src/server/ai/articleFilterJudge.test.ts`
  Expected: FAIL，服务文件不存在。

- [ ] **Step 3: 扩展 `articlesRepo`**

  给 `ArticleRow` 与相关 query 增加：
  - `filterStatus`
  - `isFiltered`
  - `filteredBy`
  - `filterEvaluatedAt`
  - `filterErrorMessage`

  并新增最小写库 helper，例如：
  - `setArticleFilterPending(...)`
  - `setArticleFilterResult(...)`

  同时把 `insertArticleIgnoreDuplicate(...)` 改成支持显式初始过滤态：
  - RSS 抓取入库时原子写入 `filter_status = 'pending'`
  - AI digest 产文和其他非 RSS 写入点默认保持 `passed`
  - 两类路径都显式写入 `is_filtered / filtered_by / filter_evaluated_at / filter_error_message`

- [ ] **Step 4: 补 AI digest 不走 `pending` 的回归测试**

  在 `src/worker/aiDigestGenerate.test.ts` 增加断言，锁定 AI digest 生成文章不会被写成 `pending`，避免被 Reader 默认过滤掉。

- [ ] **Step 5: 实现 AI 过滤执行器**

  在 `src/server/ai/articleFilterJudge.ts`：
  - 明确输入接口：`apiKey`、model、base URL、prompt、article text
  - 构造单篇文章过滤 prompt
  - 解析模型输出为结构化结果，例如 `{ matched: boolean }`
  - 对失败、超时、无效响应统一映射给上层

- [ ] **Step 6: 实现 `articleFilterService`**

  服务只负责纯业务规则：
  - 预过滤输入构造
  - 全文/摘要输入选择
  - `filtered_by` 合并与去重
  - `pending/passed/filtered/error` 最终判定
  - 先把可复用逻辑迁入新服务，但保留旧 helper 作为过渡兼容，等 Task 6 完成 `readerSnapshotService` 迁移后再删除

- [ ] **Step 7: 返回文章过滤 DTO**

  在文章详情 API、`mapArticleDto` 和 `mapSnapshotArticleItem` 中加入：
  - `filterStatus`
  - `isFiltered`
  - `filteredBy`

- [ ] **Step 8: 回跑服务与文章详情测试**

  Run: `pnpm test:unit src/server/repositories/articlesRepo.filtering.test.ts src/server/ai/articleFilterJudge.test.ts src/server/services/articleFilterService.test.ts src/worker/aiDigestGenerate.test.ts src/app/api/articles/routes.test.ts`
  Expected: PASS。

### Task 5: 新增 `article.filter` 队列任务并重排抓取后链路

**Files:**
- Modify: `src/server/queue/jobs.ts`
- Modify: `src/server/queue/jobs.test.ts`
- Modify: `src/server/queue/contracts.ts`
- Modify: `src/server/queue/contracts.test.ts`
- Modify: `src/server/queue/bootstrap.test.ts`
- Create: `src/worker/articleFilterWorker.ts`
- Create: `src/worker/articleFilterWorker.test.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/workerRegistry.test.ts`
- Modify: `src/worker/autoAiTriggers.ts`
- Modify: `src/worker/autoAiTriggers.test.ts`
- Test: `src/worker/articleFilterWorker.test.ts`
- Test: `src/server/queue/contracts.test.ts`

- [ ] **Step 1: 写队列与 worker 失败测试**

  先给 `jobs/contracts/bootstrap/workerRegistry` 增加断言，要求存在 `article.filter` 队列与 handler。

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/server/queue/contracts.test.ts src/server/queue/bootstrap.test.ts src/worker/workerRegistry.test.ts`
  Expected: FAIL，当前没有 `article.filter`。

- [ ] **Step 3: 定义队列契约**

  新增 `JOB_ARTICLE_FILTER`，并在 `contracts.ts` 配置：
  - 以 `articleId` 做 `singletonKey`
  - 允许有限重试
  - 为 AI/全文抓取延迟预留 `heartbeatSeconds`/`expireInSeconds`

- [ ] **Step 4: 写 `articleFilterWorker` 失败测试**

  在 `articleFilterWorker.test.ts` 断言：
  - 新文章先写 `pending`
  - 预过滤命中时不会调用全文抓取或 AI 过滤
  - 通过过滤后才触发 `enqueueAutoAiTriggersOnFetch`
  - 通过过滤后才触发 `JOB_AI_TRANSLATE_TITLE`
  - 任意异常兜底写 `error`，不会永久停在 `pending`
  - 即使 UI 设置在入队后发生变化，worker 仍使用 job payload 中冻结的关键词/AI prompt/feed 开关处理旧文章

- [ ] **Step 5: 在 worker 中接线**

  在 `src/worker/index.ts`：
  - 只有 RSS 抓取入库的新文章才 enqueue `article.filter`
  - enqueue payload 时冻结：
    - `articleFilter.keyword.enabled`
    - `articleFilter.keyword.keywords`
    - `articleFilter.ai.enabled`
    - `articleFilter.ai.prompt`
    - `feed.fullTextOnFetchEnabled`
    - `feed.aiSummaryOnFetchEnabled`
    - `feed.bodyTranslateOnFetchEnabled`
    - `feed.titleTranslateEnabled`
  - 删除“入库后直接自动摘要、正文翻译、标题翻译”的旧逻辑

  在 `articleFilterWorker.ts`：
  - 读取文章与 job payload
  - 只消费 job payload 中冻结的过滤配置，不再读取最新 UI 过滤设置
  - 可选抓全文
  - 调 `articleFilterJudge` 执行实际 AI 提示词过滤
  - 调 `articleFilterService`
  - 根据结果决定是否触发自动摘要、正文翻译和标题翻译

- [ ] **Step 6: 回跑 worker 测试**

  Run: `pnpm test:unit src/worker/articleFilterWorker.test.ts src/server/queue/contracts.test.ts src/server/queue/bootstrap.test.ts src/worker/workerRegistry.test.ts src/worker/autoAiTriggers.test.ts`
  Expected: PASS。

### Task 6: Reader snapshot、未读统计与 AI digest 候选统一消费过滤状态

**Files:**
- Modify: `src/server/services/readerSnapshotService.ts`
- Modify: `src/server/services/readerSnapshotService.test.ts`
- Modify: `src/server/services/readerSnapshotService.keywordFilter.test.ts`
- Delete: `src/server/services/articleKeywordFilter.ts`
- Delete: `src/server/services/articleKeywordFilter.test.ts`
- Modify: `src/app/api/reader/snapshot/route.ts`
- Modify: `src/app/api/reader/snapshot/route.test.ts`
- Modify: `src/server/repositories/aiDigestRepo.ts`
- Modify: `src/server/repositories/aiDigestRepo.test.ts`
- Modify: `src/app/api/feeds/route.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Test: `src/server/services/readerSnapshotService.test.ts`
- Test: `src/server/repositories/aiDigestRepo.test.ts`

- [ ] **Step 1: 写 Reader 查询失败测试**

  在 `readerSnapshotService.test.ts` 和 `route.test.ts` 增加断言：
  - 默认只返回 `passed + error`
  - 单 feed 且 `includeFiltered=true` 才可返回 `filtered`
  - 聚合视图即使传 `includeFiltered=true` 也仍排除 `filtered`
  - `pending` 始终不可见

- [ ] **Step 2: 写未读统计与 AI digest 候选失败测试**

  在 `aiDigestRepo.test.ts` 和 `feeds/routes.test.ts` 断言：
  - AI digest 候选排除 `pending`/`filtered`
  - feed unread count 只统计 `passed`/`error` 且 `is_read=false`

- [ ] **Step 3: 运行测试并确认失败**

  Run: `pnpm test:unit src/server/services/readerSnapshotService.test.ts src/app/api/reader/snapshot/route.test.ts src/server/repositories/aiDigestRepo.test.ts src/app/api/feeds/routes.test.ts`
  Expected: FAIL，当前逻辑仍基于关键词临时过滤，unread/AI digest 也未感知 `filter_status`。

- [ ] **Step 4: 改造 Reader snapshot 服务**

  在 `readerSnapshotService.ts`：
  - 删除 `articleKeywordFilter` 运行时过滤依赖
  - Reader 默认统一使用 canonical 可见集合：`filter_status in ('passed', 'error')`
  - 单 feed 且 `includeFiltered=true` 时扩展为 `filter_status in ('passed', 'error', 'filtered')`
  - `pending` 永远排除
  - DTO 返回过滤字段
  - unread count 查询复用同一 canonical 可见集合，而不是单独依赖 `is_filtered`

  在 `src/app/api/feeds/route.ts`：
  - 同步修改 `GET /api/feeds` 的 unread count SQL
  - 只统计 canonical 可见集合 `filter_status in ('passed', 'error') and is_read = false`

  在完成以上迁移后：
  - 删除 `src/server/services/articleKeywordFilter.ts`
  - 删除 `src/server/services/articleKeywordFilter.test.ts`

- [ ] **Step 5: 改造 AI digest 候选查询**

  在 `aiDigestRepo.ts` 只纳入：
  - canonical 可见集合 `filter_status in ('passed', 'error')`

- [ ] **Step 6: 回跑 Reader/AI digest 测试**

  Run: `pnpm test:unit src/server/services/readerSnapshotService.test.ts src/app/api/reader/snapshot/route.test.ts src/server/repositories/aiDigestRepo.test.ts src/app/api/feeds/routes.test.ts`
  Expected: PASS。

### Task 7: Reader store 与 API client 支持单 feed `includeFiltered`

**Files:**
- Modify: `src/lib/apiClient.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/store/appStore.test.ts`
- Test: `src/store/appStore.test.ts`

- [ ] **Step 1: 写 store 失败测试**

  在 `appStore.test.ts` 增加用例，断言：
  - `showFilteredByFeedId['feed-1'] = true` 时，`loadSnapshot({ view: 'feed-1' })` 会带 `includeFiltered=true`
  - 切换到其他 feed 不会串改这个开关
  - 视图切换和 snapshot 刷新依然保留前台列表/详情稳定性

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/store/appStore.test.ts`
  Expected: FAIL，当前 store 没有 `showFilteredByFeedId`，`getReaderSnapshot` 也不支持该参数。

- [ ] **Step 3: 修改 API client**

  给 `getReaderSnapshot(...)` 增加 `includeFiltered?: boolean`，只在显式传入时追加 query 参数。

- [ ] **Step 4: 修改 store**

  在 `appStore.ts`：
  - 新增 `showFilteredByFeedId: Record<string, boolean>`
  - 新增切换 action，例如 `toggleShowFilteredForFeed(feedId)`
  - `loadSnapshot` 根据当前 view 和 feed 级状态透传 `includeFiltered`
  - 保持 `articleSnapshotCache` / selected article detail 的现有保护不被破坏

- [ ] **Step 5: 回跑 store 测试**

  Run: `pnpm test:unit src/store/appStore.test.ts`
  Expected: PASS。

### Task 8: Reader 前端交互展示已过滤文章

**Files:**
- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`
- Modify: `src/features/articles/ArticleList.tsx`
- Modify: `src/features/articles/ArticleList.test.tsx`
- Modify: `src/features/articles/ArticleView.tsx`
- Test: `src/features/feeds/FeedList.test.tsx`
- Test: `src/features/articles/ArticleList.test.tsx`

- [ ] **Step 1: 写 RSS 右键菜单失败测试**

  在 `FeedList.test.tsx` 断言：
  - RSS feed 上显示“查看已过滤文章”或“隐藏已过滤文章”
  - `ai_digest` feed 不显示该入口
  - 点击后调用 store 切换并刷新当前 feed snapshot

- [ ] **Step 2: 写文章列表/详情失败测试**

  在 `ArticleList.test.tsx` 断言：
  - `filtered` 文章显示 `已过滤` 标记
  - 标记不会阻止点击打开
  - 聚合视图默认不显示这些文章

- [ ] **Step 3: 运行测试并确认失败**

  Run: `pnpm test:unit src/features/feeds/FeedList.test.tsx src/features/articles/ArticleList.test.tsx`
  Expected: FAIL，当前菜单还是“配置关键词过滤”，文章 DTO 也没有过滤状态。

- [ ] **Step 4: 实现前端交互**

  在 `FeedList.tsx`：
  - 删除“配置关键词过滤”
  - 替换为“查看已过滤文章 / 隐藏已过滤文章”

  在 `ArticleList.tsx`：
  - 基于 DTO 渲染 `已过滤` badge
  - 视觉降权但保持点击与键盘导航可用

  在 `ArticleView.tsx`：
  - 增加轻量 `已过滤` 状态说明

- [ ] **Step 5: 回跑前端交互测试**

  Run: `pnpm test:unit src/features/feeds/FeedList.test.tsx src/features/articles/ArticleList.test.tsx`
  Expected: PASS。

### Task 9: 删除旧的 feed 级关键词过滤链路

**Files:**
- Delete: `src/app/api/feeds/[id]/keyword-filter/route.ts`
- Delete: `src/app/api/feeds/[id]/keyword-filter/route.test.ts`
- Delete: `src/features/feeds/FeedKeywordFilterDialog.tsx`
- Delete: `src/features/feeds/FeedKeywordFilterDialog.test.tsx`
- Modify: `src/app/api/feeds/[id]/route.ts`
- Modify: `src/app/api/feeds/routes.test.ts`
- Modify: `src/lib/apiClient.ts`
- Test: `src/app/api/feeds/routes.test.ts`

- [ ] **Step 1: 写清理失败测试**

  在 `routes.test.ts` 增加或修改断言：
  - 删除 feed 时不再读取/写回 `settings.rss.articleKeywordFilter.feedKeywordsByFeedId`
  - feed PATCH/DELETE 不再依赖这组设置结构

- [ ] **Step 2: 运行测试并确认失败**

  Run: `pnpm test:unit src/app/api/feeds/routes.test.ts`
  Expected: FAIL，当前 DELETE 仍会清理 `feedKeywordsByFeedId`。

- [ ] **Step 3: 删除旧实现**

  - 移除 `/api/feeds/[id]/keyword-filter`
  - 从 `FeedList` 和任何 import 链路中删除 `FeedKeywordFilterDialog`
  - 从 `feeds/[id]/route.ts` 的 DELETE 中删除 settings 清理逻辑
  - 从 `src/lib/apiClient.ts` 删除 `getFeedKeywordFilter(...)` 与 `patchFeedKeywordFilter(...)`

- [ ] **Step 4: 回跑旧链路相关测试**

  Run: `pnpm test:unit src/app/api/feeds/routes.test.ts src/features/feeds/FeedList.test.tsx`
  Expected: PASS，且不再引用旧 route/dialog。

### Task 10: 收尾验证

**Files:**
- Modify: `docs/superwork/plans/2026-03-20-article-filter-refactor.md`

- [ ] **Step 1: 运行目标测试集合**

  Run: `pnpm test:unit src/server/db/migrations/articleFilteringMigration.test.ts src/features/settings/settingsSchema.test.ts src/server/repositories/articlesRepo.filtering.test.ts src/server/ai/articleFilterJudge.test.ts src/server/services/articleFilterService.test.ts src/worker/aiDigestGenerate.test.ts src/worker/articleFilterWorker.test.ts src/server/services/readerSnapshotService.test.ts src/server/repositories/aiDigestRepo.test.ts src/store/appStore.test.ts src/features/feeds/FeedPolicyDialogs.test.tsx src/features/feeds/FeedList.test.tsx src/features/articles/ArticleList.test.tsx`
  Expected: PASS。

- [ ] **Step 2: 运行构建验证**

  Run: `pnpm build`
  Expected: BUILD SUCCESS，无 TypeScript、route handler、worker 或 DTO 回归错误。

- [ ] **Step 3: 整理交付说明**

  在最终回复中明确说明：
  - 过滤配置只影响之后新入库文章
  - 不包含浏览器自动化测试
  - 已清理旧的 `feedKeywordsByFeedId` 链路
