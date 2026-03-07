# RSS 关键词过滤设计

- 日期：2026-03-07
- 状态：已确认（Approved）
- 范围：
  - `src/types/index.ts`
  - `src/features/settings/settingsSchema.ts`
  - `src/features/settings/validateSettingsDraft.ts`
  - `src/store/settingsStore.ts`
  - `src/features/settings/panels/RssSettingsPanel.tsx`
  - `src/server/repositories/settingsRepo.ts`
  - `src/server/services/readerSnapshotService.ts`
  - `src/app/api/settings/route.ts`
  - `src/app/api/feeds/[id]/keyword-filter/route.ts`
  - `src/lib/apiClient.ts`
  - `src/store/appStore.ts`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/FeedKeywordFilterDialog.tsx`
  - `docs/plans/2026-03-07-rss-keyword-filter-implementation-plan.md`

## 1. 背景与目标

FeedFuse 当前已经具备 RSS 抓取、文章列表展示、阅读器设置中心以及 RSS 源右键菜单等能力，但缺少“按关键词隐藏噪音文章”的机制。用户希望配置一组关键词后，让命中的文章默认不出现在文章列表中，同时仍然保留文章本体，不影响入库、未读状态、星标状态以及其他 AI / 抓取流程。

本次需求目标：

1. 支持配置**全局关键词过滤规则**，作用于所有 RSS 源。
2. 支持配置**单个 RSS 源的关键词过滤规则**，并与全局规则叠加生效。
3. 命中规则的文章继续保留在数据库中，但在文章列表默认隐藏。
4. 首版仅匹配 `title + summary`，采用“每行一个关键词/短语、大小写不敏感、命中任一项即隐藏”的朴素语义。
5. 继续沿用现有设置持久化与 `reader snapshot` 主链，不在前端维护第二套过滤事实来源。

## 2. 已确认方向与边界

### 2.1 方案选型

采用方案 B：**在设置中持久化关键词规则，并在 `reader snapshot` 层统一过滤文章列表结果。**

原因：

1. 当前 feed / article 主链以 `reader snapshot` 为事实来源，本次继续沿用该模式风险最低。
2. 相比纯前端本地隐藏，snapshot 层过滤能保持分页语义稳定，也更符合项目已有“单一事实来源”经验。
3. 相比抓取入库时就写 `hidden` 状态，本次设计不需要历史文章回溯重算，复杂度更适合 MVP。

### 2.2 已确认范围

1. 语义为“**仅在列表隐藏但仍保留**”，不删除、不跳过入库。
2. 作用域为“**全局规则 + 单个 feed 规则**”。
3. 全局规则位于 RSS 设置面板。
4. feed 规则入口位于 RSS 源右键菜单，点击后打开独立弹窗配置。
5. 匹配字段为 `title + summary`。
6. 匹配逻辑为逐行关键词/短语、大小写不敏感、命中任一项即隐藏。
7. 全局规则与 feed 规则**叠加生效**。

### 2.3 不做内容

1. 不实现正则表达式、布尔逻辑、优先级、启用/停用等高级规则语法。
2. 不实现分类级规则。
3. 不在 `AddFeedDialog` 或 `FeedDialog` 中直接配置关键词过滤。
4. 不新增“显示被隐藏文章”“显示命中原因”“显示已隐藏数量”等增强 UI。
5. 不改变文章 `isRead` / `isStarred` 或 worker 抓取、翻译、摘要逻辑。
6. 首版不调整左栏未读数统计口径；未读数仍表示真实未读总数。

## 3. 相关经验与竞品参考

### 3.1 项目内经验与约束

- 参考总结：[`docs/summaries/2026-03-06-feed-category-inline-management.md`](../summaries/2026-03-06-feed-category-inline-management.md)
  - 启发 1：影响 feed / list 语义的状态，应优先回到 snapshot 主链，不在 `FeedList` 本地维护第二套事实来源。
  - 启发 2：局部 UI 操作可以走窄接口，但最终事实仍应收敛到共享持久化与 snapshot。
- 参考总结：[`docs/summaries/2026-03-07-rss-feed-fetch-error-indicator.md`](../summaries/2026-03-07-rss-feed-fetch-error-indicator.md)
  - 启发 1：新增 feed / article 展示语义时，继续沿用 `snapshot -> apiClient -> store -> UI` 单一路径。
  - 启发 2：不要把局部展示逻辑建立在组件本地派生状态之上，否则容易出现分页、刷新与测试夹具不一致。
- 参考总结：[`docs/summaries/2026-03-06-rss-feed-context-menu-redesign.md`](../summaries/2026-03-06-rss-feed-context-menu-redesign.md)
  - 启发：左栏 RSS 源右键菜单已经承接高频的源级操作，适合作为 feed 级关键词过滤配置入口。

### 3.2 竞品参考（截至 2026-03-07）

1. `Feedly`：`Mute Filters` 支持按关键词/短语静音，并支持对全部 feeds 或单个 source 生效，适合作为“全局 + feed 作用域”参考。
   - `https://docs.feedly.com/article/109-how-can-i-add-create-a-mute-filter`
   - `https://docs.feedly.com/article/298-does-it-mute-from-my-entire-feed`
   - `https://docs.feedly.com/article/106-can-i-filter-by-just-the-article-title`
2. `Inoreader`：`Rules` 以“条件 + 动作”处理新文章，说明更高级的自动化路径通常建立在系统层，而非列表组件本地筛选。
   - `https://www.inoreader.com/blog/2025/10/introducing-new-rule-triggers-and-actions-translations-summaries-and-more.html`
3. `TT-RSS`：`Content Filters` 支持字段匹配与动作链，适合作为未来升级到规则引擎时的参考。
   - `https://tt-rss.org/wiki/ContentFilters/`
4. `Feedbin`：`Actions` 面向 incoming articles 执行自动处理，说明“列表隐藏”通常是系统层能力，而非临时 UI 遮罩。
   - `https://feedbin.com/home`
   - `https://feedbin.com/help/search-syntax/`

本次设计仅借鉴它们的**作用域模型与系统层过滤思路**，不引入复杂动作链。

## 4. 方案比较与选型

### 方案 A：纯前端本地隐藏

- 做法：将关键词规则保存到设置中，但仅在 `ArticleList` 组件内对 `articles` 本地过滤。
- 优点：改动最少。
- 缺点：
  1. 与项目已有的 snapshot 单一事实来源原则冲突。
  2. 分页会失真：服务端返回 50 条，前端过滤后可能只剩很少可见文章。
  3. 后续若增加“显示隐藏文章”或命中统计，状态会持续发散。

### 方案 B（采纳）：snapshot 层统一过滤

- 做法：规则持久化到 `ui_settings`，`readerSnapshotService` 在出数时统一应用全局 + feed 规则，前端直接消费过滤后的列表。
- 优点：
  1. 与现有 `snapshot -> apiClient -> store -> UI` 主链一致。
  2. 分页语义可控，未来扩展“隐藏数量 / 查看隐藏项 / 命中原因”也更自然。
  3. 支持设置中心全局规则与 feed 局部规则共存。
- 缺点：
  1. 需要同时改动设置持久化、snapshot 逻辑、前端设置面板与 feed 菜单弹窗。
  2. 为保持分页稳定，需要在 snapshot 层谨慎处理“过滤后凑满 limit”的逻辑。

### 方案 C：抓取入库时写隐藏状态

- 做法：worker 在文章入库时根据规则打标，列表默认排除隐藏文章。
- 优点：长远最适合复杂规则与统计。
- 缺点：
  1. 规则一旦修改，需要对历史文章回溯重算。
  2. 与本次“仅列表隐藏”的 MVP 目标不匹配。
  3. 会把复杂度提前转移到 worker 与数据模型层。

结论：采用方案 B。

## 5. 架构与数据流设计

### 5.1 持久化模型

在 `PersistedSettings.rss` 下新增轻量规则结构：

```ts
articleKeywordFilter: {
  globalKeywords: string[];
  feedKeywordsByFeedId: Record<string, string[]>;
}
```

设计要点：

1. 规则归属 `rss`，而不是 `general`，因为它描述的是 RSS 出数行为。
2. 使用数组而不是原始多行字符串，便于标准化、去重与后续扩展。
3. `feedKeywordsByFeedId` 以 `feedId` 为 key，避免 feed 标题修改导致规则漂移。

### 5.2 设置写入链路

#### 全局规则

1. 用户在 `RssSettingsPanel` 中编辑“全局文章关键词隐藏”。
2. `settingsStore` 的 `draft.persisted.rss.articleKeywordFilter.globalKeywords` 保存标准化后的数组。
3. 继续通过 `src/app/api/settings/route.ts` 与 `src/server/repositories/settingsRepo.ts` 写入 `app_settings.ui_settings`。
4. 保存成功后沿用现有 autosave 反馈，并重新触发 snapshot 加载，让列表按最新规则重新出数。

#### feed 级规则

1. 用户在 `FeedList` 中右键某个 RSS 源，点击“配置关键词过滤”。
2. 打开独立弹窗 `FeedKeywordFilterDialog`，展示该 `feedId` 对应的规则。
3. 弹窗保存走独立窄接口 `PATCH /api/feeds/[id]/keyword-filter`。
4. 服务端内部仍然修改同一份 `app_settings.ui_settings`，只局部更新 `feedKeywordsByFeedId[feedId]`。
5. 保存成功后关闭弹窗，并重新触发 snapshot 加载。

采用独立窄接口的原因：

1. `FeedList` 不应为了一个局部弹窗而依赖整份 `settingsStore`。
2. 避免读取旧 settings 后整包提交，覆盖掉设置中心同时发生的其他改动。
3. 交互语义更清晰：这是“单个 feed 的局部配置操作”。

### 5.3 过滤执行链路

`readerSnapshotService.getReaderSnapshot(...)` 负责文章列表出数。新增关键词过滤后，执行顺序为：

1. 先按现有 `view` 条件筛选候选文章：`all` / `unread` / `starred` / feed。
2. 读取 `ui_settings` 中的 `rss.articleKeywordFilter`。
3. 对每篇候选文章，合并：
   - `globalKeywords`
   - `feedKeywordsByFeedId[article.feedId]`
4. 用合并后的关键词对 `title + summary` 做大小写不敏感的包含匹配。
5. 命中任一关键词则从返回列表中排除。
6. 返回未命中的可见文章给前端。

### 5.4 分页语义

为避免“当前页过滤后只剩少量结果”，snapshot 层不能简单“查一页 -> filter -> 返回”。设计要求：

1. 继续按现有排序 `publishedAt desc, id desc` 读取候选文章。
2. 边读取边过滤，直到累计到 `limit + 1` 条**可见文章**或候选集耗尽。
3. `nextCursor` 基于最后一条可见文章之后的候选位置继续生成。

这保证：

1. 用户看到的一页文章数量更稳定。
2. 翻页时不会因为前面有很多被过滤文章而异常跳页或提前结束。

### 5.5 不受影响的系统行为

1. `articles` 表不新增 `hidden` 字段。
2. 不修改 `isRead` / `isStarred`。
3. 不影响抓取、全文抽取、AI 摘要、AI 翻译等 worker 流程。
4. 左栏未读数继续表示真实未读总数，而非“过滤后未读数”。

## 6. UI 与交互设计

### 6.1 全局规则入口

在 `src/features/settings/panels/RssSettingsPanel.tsx` 新增一个卡片区块：

- 标题：`全局文章关键词隐藏`
- 说明：`每行一个关键词或短语，命中标题或摘要时会从文章列表隐藏。`
- 控件：多行 `Textarea`
- 辅助文案：可展示示例，如 `广告`、`招聘`、`Sponsored`

交互原则：

1. 继续复用设置中心现有 autosave，不新增单独“保存”按钮。
2. 用户输入时先保留草稿，多行文本在保存链路中标准化为字符串数组。
3. 空行忽略，不向用户暴露复杂语法。

### 6.2 feed 级规则入口

在 `src/features/feeds/FeedList.tsx` 的 RSS 源右键菜单中新增一项：

- 菜单项：`配置关键词过滤`

点击后打开独立弹窗 `FeedKeywordFilterDialog`：

- 标题：`配置关键词过滤`
- 副标题：显示当前 feed 名称
- 说明：`每行一个关键词或短语，命中标题或摘要时会从文章列表隐藏；会与全局关键词叠加生效。`
- 控件：多行 `Textarea`
- 按钮：`取消` / `保存`

设计原因：

1. 关键词过滤属于 feed 局部行为规则，而不是 feed 基础元数据。
2. 右键菜单已是 feed 级高频操作入口，与“编辑 / 移动分类 / 删除”等同域。
3. 避免把 `FeedDialog` 持续堆成大而全表单。

### 6.3 首版刻意不做的交互

1. 不在左栏 feed 项上显示“已配置规则”徽标。
2. 不在文章列表顶部显示“已隐藏 N 篇”。
3. 不提供“显示被隐藏文章”切换。
4. 不在添加 feed 时直接配置关键词过滤。

## 7. 标准化、错误处理与边界情况

### 7.1 规则标准化

无论来自设置中心还是 feed 弹窗，规则保存前都执行统一标准化：

1. 每行 `trim`。
2. 空行丢弃。
3. 对大小写不敏感的重复项去重。
4. 存储时保留用户输入的原始大小写展示值，匹配时统一转小写。

### 7.2 匹配边界

1. 若文章 `summary` 为空，则仅匹配 `title`。
2. 若 `title` 与 `summary` 都为空，则视为不命中。
3. feed 没有局部规则时，只应用全局规则。
4. 同一文章若同时命中全局与 feed 规则，仍仅视为一次隐藏。

### 7.3 feed 生命周期边界

1. feed 删除后，应同步清理 `feedKeywordsByFeedId[feedId]`，避免遗留孤儿规则。
2. 即使遗漏清理，snapshot 读取时也必须忽略不存在 feed 的规则 key，避免运行错误。

### 7.4 接口失败处理

1. 设置中心全局规则保存失败：沿用 autosave 错误提示，并保留草稿。
2. feed 弹窗保存失败：toast 提示错误，不关闭弹窗，保留用户输入。
3. `PATCH /api/feeds/[id]/keyword-filter` 的 `feedId` 不存在时返回 `404`。
4. 因为本期规则仅为字符串列表，首版不引入复杂字段级 validation error，只做标准化与基本类型保护。

## 8. 测试策略

### 8.1 纯逻辑与标准化测试

新增纯函数测试，覆盖：

1. 多行输入的 `trim`、空行忽略与去重。
2. 大小写不敏感匹配。
3. `globalKeywords + feedKeywords` 叠加行为。
4. 仅 `title`、仅 `summary`、两者为空等边界。

### 8.2 snapshot 服务测试

在 `readerSnapshotService` 相关测试中覆盖：

1. `all` / `unread` / `starred` / 单 feed 视图都能应用关键词过滤。
2. 有大量命中文章时，分页仍能尽量凑满 `limit` 条可见文章。
3. `nextCursor` 在过滤后仍正确指向后续候选集。

### 8.3 设置与 API 测试

1. `/api/settings` 能正确保存新的 `rss.articleKeywordFilter.globalKeywords`。
2. `PATCH /api/feeds/[id]/keyword-filter` 仅修改目标 feed 的局部规则。
3. feed 删除后会清理对应规则，或至少读取时可忽略孤儿规则。

### 8.4 前端交互测试

1. `RssSettingsPanel` 能展示、编辑并提交全局多行关键词规则。
2. `FeedList` 的 RSS 源右键菜单中存在“配置关键词过滤”。
3. `FeedKeywordFilterDialog` 能回填已有规则、保存成功后关闭、失败时保留输入。

### 8.5 回归测试重点

1. `snapshot` DTO / `apiClient` / store / UI 的字段映射保持一致。
2. 不在 `ArticleList` 本地维护第二套过滤逻辑。
3. 右键菜单现有编辑、分类移动、删除能力不受影响。

## 9. 验收标准

1. 用户可在 RSS 设置面板配置全局关键词过滤规则。
2. 用户可在单个 RSS 源右键菜单中打开独立弹窗，配置该源的关键词过滤规则。
3. 全局规则与 feed 规则按“命中任一项即隐藏”叠加生效。
4. 命中文章继续保留在数据库中，但不会出现在默认文章列表中。
5. `all` / `unread` / `starred` / 单 feed 视图都遵循相同过滤语义。
6. 分页在过滤后仍保持稳定，不会出现明显少页或提前结束。
7. 删除 feed 后不会留下可见的无效局部规则。
8. 相关单元测试通过，`lint` 通过。

## 10. 非目标与后续空间

### 本期非目标

1. 不实现分类级关键词规则。
2. 不实现正则、布尔组合、优先级、动作链或规则启用/停用。
3. 不实现“查看被隐藏文章”或隐藏数量提示。
4. 不重算历史文章状态，也不在数据库中持久化隐藏标记。

### 后续可演进方向

1. 为规则增加 `enabled`、`matchFields`、`caseSensitive` 等属性。
2. 增加分类级作用域，形成 `global -> category -> feed` 规则层级。
3. 在文章列表提供“查看隐藏文章”调试开关或命中计数。
4. 进一步升级为面向新文章的自动化规则系统。
