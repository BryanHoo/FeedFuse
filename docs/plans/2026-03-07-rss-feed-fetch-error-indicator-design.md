# RSS 源拉取异常指示设计

- 日期：2026-03-07
- 状态：已确认（Approved）
- 范围：
  - `src/server/repositories/feedsRepo.ts`
  - `src/server/services/readerSnapshotService.ts`
  - `src/lib/apiClient.ts`
  - `src/types/index.ts`
  - `src/store/appStore.ts`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedList.test.tsx`
  - `docs/plans/2026-03-07-rss-feed-fetch-error-indicator-implementation-plan.md`

## 1. 背景与目标

当前 RSS 源的后台抓取失败后，系统虽然已经把抓取结果写入 `feeds.last_fetch_status` 与 `feeds.last_fetch_error`，但这些信息没有透出到阅读器快照，也没有在左栏 RSS 源列表中展示。结果是：

1. 用户只能从文章未更新、toast 或日志间接猜测某个源是否失败。
2. 页面刷新后无法在左栏稳定复现错误状态。
3. 自动刷新、手动刷新、以及新增订阅后的首次后台拉取，虽然都走同一条 worker 链路，但左栏没有统一反馈。

本次需求目标：

1. 当某个 RSS 源后台更新失败或异常时，左栏对应 RSS 源显示异常态（红色）。
2. 用户 hover 或 focus 到该 RSS 源时，可看到具体错误信息。
3. 下次重新拉取时，新结果覆盖旧错误；若拉取成功，则自动恢复正常显示。
4. 同时覆盖自动刷新、手动刷新（单个/全部）、以及新增 RSS 后首次后台拉取场景。

## 2. 已确认方向与边界

### 2.1 方案选型

采用方案 A：**复用现有 `feeds.last_fetch_error` / `last_fetch_status` 持久化字段，不新增 `feed_tasks` 或前端本地错误状态机。**

原因：

1. 当前数据库与 worker 已具备“每次抓取覆盖写入结果”的语义，天然符合需求。
2. 现有左栏 feed / category 数据流以 `reader snapshot` 为事实来源，本次继续沿用这条主链，风险最低。
3. 相比新增任务表或前端临时态，这条路径最小、最稳定、最符合已有项目约束。

### 2.2 已确认范围

1. 覆盖自动定时刷新。
2. 覆盖手动刷新单个 RSS 源与手动刷新全部 RSS 源。
3. 覆盖新增 RSS 后首次后台拉取。
4. hover 内容采用“用户友好文案 + 必要时附带简短技术细节”。

### 2.3 不做内容

1. 不新增独立 `feed_tasks` 表。
2. 不新增专门的 feed 错误查询 API。
3. 不把“刷新接口入队失败”混同为 feed 的后台抓取失败状态。
4. 不展示原始堆栈、HTML 片段或敏感信息。

## 3. 相关经验与已知约束来源

- 参考总结：[`docs/summaries/2026-03-06-feed-category-inline-management.md`](../summaries/2026-03-06-feed-category-inline-management.md)
  - 启发 1：分类与 feed 列表仍应由 snapshot 作为最终事实来源，不在 `FeedList` 本地维护第二套状态机。
  - 启发 2：会影响 feed 结构或显示语义的状态，优先回到共享 snapshot 链路，避免局部乐观态长期漂移。
- 参考总结：[`docs/summaries/2026-03-04-async-tasks-refactor.md`](../summaries/2026-03-04-async-tasks-refactor.md)
  - 启发 1：错误信息需要持久化，才能在刷新后稳定复现。
  - 启发 2：错误文案必须短、稳定、安全，不能把底层原始异常直接暴露到 UI。
- 参考总结：[`docs/summaries/2026-03-06-rss-feed-context-menu-redesign.md`](../summaries/2026-03-06-rss-feed-context-menu-redesign.md)
  - 启发：左栏是高频操作区，新增状态提示时应优先复用共享 UI 能力，不在业务层堆临时结构。

## 4. 方案比较与选型

### 方案 A（采纳）：复用现有 `feeds` 拉取结果字段并透出到 snapshot

- 做法：保持 worker 继续写 `last_fetch_status` / `last_fetch_error`，将字段透出到 `reader snapshot`，前端左栏基于 `fetchError` 展示异常态与 tooltip。
- 优点：
  - 与“下次重新拉取覆盖；成功即恢复”完全一致。
  - 不引入新表、新接口或新状态机。
  - 自动刷新、手动刷新和新增后首次拉取都能自然覆盖。
- 缺点：
  - 只保留最近一次抓取结果，不保留历史。
  - 不提供 `queued/running` 粒度。

### 方案 B：新增 `feed_tasks` 持久化模型

- 优点：
  - 可以扩展更丰富的任务态（`queued/running/failed`）。
  - 与文章任务状态模型形式一致。
- 缺点：
  - 当前需求明显偏重。
  - 会与 `feeds.last_fetch_error` 形成两套相近语义。

### 方案 C：前端维护临时错误态

- 优点：
  - 改动最少。
- 缺点：
  - 页面刷新后状态丢失。
  - 无法可靠覆盖自动刷新。
  - 与 snapshot 事实源策略冲突。

结论：采用方案 A。

## 5. 架构与数据流设计

### 5.1 持久化状态来源

`src/worker/index.ts` 中的 `fetchAndIngestFeed(...)` 已通过 `recordFeedFetchResult(...)` 在 `finally` 中写入抓取结果：

1. 失败时写入新的错误文案。
2. 成功或 `304` 时写入 `error = null`，从而清掉旧错误。
3. 因为写入发生在每次抓取完成后，所以天然满足“下次覆盖”的需求。

本次设计不改变这条语义，只增强：

1. 写入的错误文案要更稳定、用户可读。
2. 前端需要能在 snapshot 中读到它。

### 5.2 后端透出链路

后端链路调整为：

1. `feedsRepo.listFeeds(...)` 查询并返回 `last_fetch_status as "lastFetchStatus"` 与 `last_fetch_error as "lastFetchError"`。
2. `readerSnapshotService.getReaderSnapshot(...)` 将这两个字段带到 `ReaderSnapshotFeed`。
3. `/api/reader/snapshot` 继续作为左栏状态的唯一来源，不新增额外查询。

### 5.3 前端消费链路

前端链路调整为：

1. `src/lib/apiClient.ts` 为 `ReaderSnapshotDto['feeds'][number]` 增加 `lastFetchStatus` / `lastFetchError`。
2. `mapFeedDto(...)` 将其映射为前端 `Feed` 上的 `fetchStatus` / `fetchError`（命名以实现阶段最终决定为准，但语义固定）。
3. `src/store/appStore.ts` 继续只在 `loadSnapshot()` 时用 snapshot 覆盖 feeds，不单独维护错误态。
4. `src/features/feeds/FeedList.tsx` 基于 `feed.fetchError` 控制异常样式与 tooltip。

### 5.4 触发场景语义

左栏异常态只反映**后台抓取执行结果**，不反映“刷新接口是否成功入队”：

1. `POST /api/feeds/:id/refresh` 或 `POST /api/feeds/refresh` 自身失败：继续走 toast，不写左栏异常态。
2. 入队成功但 worker 拉取失败：worker 覆盖写入错误，左栏在下一次 snapshot 中显示异常态。
3. 后续抓取成功：worker 清空错误，左栏自动恢复正常。

## 6. UI 与交互设计

### 6.1 左栏异常态规则

当 `feed.fetchError` 非空时，该 feed 进入异常态：

1. feed 行本身保留现有布局、点击和右键菜单行为。
2. 选中态与异常态可以共存：保留现有选中背景，同时让标题/错误标识保持异常色。
3. 已停用 feed 若存在错误，继续保留当前的低透明度语义，但错误色应仍然可辨识。

### 6.2 视觉表现

为避免与当前选中态冲突，不采用整行高饱和红底，而采用轻量异常表达：

1. feed 标题文字切换到 `destructive` 相关色。
2. 左侧图标区增加轻量异常色或警示 icon。
3. 若需要额外可见性，可在标题右侧增加一个小型错误点或警示图标。

### 6.3 tooltip 交互

复用现有 `src/components/ui/tooltip.tsx`，而不是使用原生 `title`：

1. 异常 feed 才显示 tooltip。
2. feed 行整体作为 `TooltipTrigger`，支持 hover 与 keyboard focus。
3. 正常 feed 不出现 tooltip，避免无意义噪音。

tooltip 内容结构：

1. 第一行：固定状态提示，例如“更新失败”。
2. 第二行：具体错误，例如“请求超时”或“源站拒绝访问（HTTP 403）”。
3. 文案过长时需要限制宽度并允许换行或截断，避免浮层过宽。

### 6.4 无障碍要求

1. 错误状态不能只靠颜色表达，需配合警示 icon 或 `sr-only` 文案。
2. 键盘 focus 到异常 feed 时，也应读取到错误提示或等价辅助信息。
3. 不改变现有按钮/菜单语义，不破坏键盘导航顺序。

## 7. 错误文案策略

### 7.1 总原则

后端负责产出最终展示给用户的错误文案，前端只做展示，不二次拼装底层异常。

文案规则：

1. 以用户友好描述为主。
2. 仅附带必要的简短技术细节。
3. 禁止暴露堆栈、HTML、密钥、内部路径等敏感信息。

### 7.2 推荐映射

推荐在 feed 抓取链路增加轻量错误归一化，输出稳定文案，例如：

1. `Unsafe URL` → `更新失败：地址不安全`
2. 超时类错误 → `更新失败：请求超时`
3. `HTTP 403` → `更新失败：源站拒绝访问（HTTP 403）`
4. 解析失败 → `更新失败：RSS 解析失败`
5. 未知异常 → `更新失败：发生未知错误`

此映射不要求建立完整错误码体系，但要求：

1. 同类错误尽量输出稳定文案。
2. `last_fetch_error` 中存储的就是可直接展示的安全短文案。

## 8. 测试与验收设计

### 8.1 后端测试

1. `feedsRepo` 测试覆盖 `listFeeds()` 已选择并返回 `last_fetch_status` / `last_fetch_error`。
2. `readerSnapshotService` 测试覆盖 snapshot 已带出 feed 的错误字段。
3. worker 或错误映射测试覆盖：
   - 抓取失败时写入友好错误文案。
   - 抓取成功时清空旧错误。

### 8.2 前端测试

1. `apiClient` / store 测试覆盖 feed 错误字段的映射与 snapshot 同步。
2. `FeedList` 组件测试覆盖：
   - 异常 feed 出现错误样式或错误标识。
   - hover / focus 异常 feed 时展示 tooltip。
   - feed 恢复成功后错误样式消失。
   - 选中态与异常态共存时，选中反馈仍可见。

### 8.3 验收标准

1. 自动刷新失败后，左栏对应 RSS 源显示异常态。
2. 手动刷新单个或全部 RSS 源后，若 worker 实际抓取失败，左栏显示异常态。
3. 新增 RSS 后首次后台拉取失败，左栏可见异常态。
4. hover 或 focus 异常 feed 时，可看到具体错误。
5. 下一次抓取成功后，错误状态自动恢复正常。

## 9. 结论

本次需求的核心不是新增一套“任务系统”，而是把已经存在的 feed 抓取结果字段接入现有 snapshot 与左栏显示链路，并对错误文案做安全、稳定、可理解的整理。这样既满足“失败标红、hover 看报错、下次成功自动恢复”的用户体验，也保持了项目当前以 snapshot 为事实来源的架构一致性。
