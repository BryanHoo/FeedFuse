# 文章过滤重构设计

- 日期：2026-03-20
- 状态：已确认
- 关联设计：
  - `docs/superpowers/specs/2026-03-14-ai-digest-design.md`
  - `docs/superpowers/specs/2026-03-17-ai-digest-article-sources-design.md`
  - `docs/superpowers/specs/2026-03-18-ai-digest-source-navigation-design.md`
- 需求：重构文章过滤机制，新增全局关键词过滤与全局 AI 提示词过滤；新增 RSS 源级“入库自动抓取全文”配置，并在开启时让过滤优先基于全文；被过滤文章仍需入库，但 Reader 默认不显示、AI 解读不纳入；用户可在单个 RSS 源右键开启“查看已过滤文章”，在中栏查看全部文章并标记已过滤状态。

## 背景

当前文章过滤只存在于 `readerSnapshotService` 的 Reader 列表查询阶段：

- 配置来源是 `PersistedSettings.rss.articleKeywordFilter`
- 过滤逻辑只支持关键词匹配
- 命中后文章只是从 Reader snapshot 中被跳过
- 数据库中没有“该文章已被过滤”的持久化状态
- AI 解读候选也没有复用同一份过滤结果

这套实现已经无法满足新需求：

- 过滤规则需要扩展为两类
  - 全局关键词过滤
  - 全局 AI 提示词过滤
- 过滤结果必须是文章级持久化事实，而不是 Reader 临时跳过
- 被过滤文章要继续保存在数据库中
- Reader 默认不显示被过滤文章，但要支持单个 RSS 源临时查看
- AI 解读必须排除被过滤文章
- 过滤是否使用全文，不再通过独立新开关控制，而是由 RSS 源的“入库自动抓取全文”配置决定

因此，本次设计不是给现有 Reader 关键词过滤打补丁，而是把“文章过滤”升级为一条覆盖抓取、全文、过滤、Reader 与 AI 解读的统一链路。

## 目标

- 将文章过滤结果持久化到数据库中的文章记录
- 支持两种全局过滤规则
  - 关键词过滤
  - AI 提示词过滤
- 新增 RSS 源级 `fullTextOnFetchEnabled` 配置
- 当 `fullTextOnFetchEnabled` 开启时，新文章入库后先抓全文，再基于全文执行过滤
- 被过滤文章默认不进入 Reader 中栏，也不进入 AI 解读候选
- 被过滤文章仍保存在数据库中，并带有明确过滤标记
- 用户可在单个 RSS 源右键开启“查看已过滤文章”
- 开启后，中栏显示该 RSS 源全部文章，并对已过滤文章增加标记
- 已过滤文章不计入未读统计，也不进入未读视图
- 修改过滤配置后不回刷历史文章，只影响之后新入库的文章
- AI 过滤失败时默认放行文章，不误杀内容

## 非目标

- 不对历史文章批量补跑关键词过滤或 AI 过滤
- 不对 `all / unread / starred / ai_digest` 等聚合视图开放“查看已过滤文章”
- 不在第一版中引入“为什么被过滤”的复杂可视化解释面板
- 不新增浏览器自动化测试
- 不改变现有 AI 解读来源展示与导航设计

## 已确认输入

- 关键词过滤采用单篇文章判断，而不是批量筛选
- AI 过滤也采用单篇文章判断，而不是对一批文章整体排序或裁剪
- 关键词过滤与 AI 过滤规则直接作用于所有 RSS 源
- “是否用全文参与过滤”不做全局开关
  - 由每个 RSS 源的 `fullTextOnFetchEnabled` 决定
- 已过滤文章不计入未读统计，也不进入未读视图
- 修改过滤配置后不重算历史文章
- AI 过滤失败时默认显示文章
- 被过滤文章仍需保留在数据库中，只是在 Reader 默认不显示，AI 解读不纳入
- 单个 RSS 源可以通过右键切换“查看已过滤文章”

## 备选方案

### 方案 A：Reader / AI 解读读取时动态计算过滤结果

做法：

- 新文章入库时不写任何过滤状态
- Reader snapshot 查询时重新计算是否过滤
- AI 解读候选查询时也重新计算是否过滤

优点：

- 表面上少改表

缺点：

- 与“配置变更不回刷历史文章”直接冲突
- AI 过滤无法在每次读取时重复调用
- Reader 与 AI 解读容易因为计算入口不同而漂移
- 无法可靠表达“数据库中需要存在，并且标记已过滤”

结论：不采用。

### 方案 B：前端自行隐藏，后端不持久化过滤状态

做法：

- 后端继续返回全部文章
- 前端按配置自行隐藏 Reader 列表中的文章
- AI 解读侧额外再加一套独立过滤逻辑

优点：

- Reader 页面改动表面上更快

缺点：

- 前端隐藏与 AI 解读过滤会分叉
- 数据库层没有统一过滤事实
- 右键“查看已过滤文章”只能变成前端临时状态，不具备可靠语义

结论：不采用。

### 方案 C：入库后持久化过滤结果，并由 Reader / AI 解读复用（采用）

做法：

- 新文章先入库
- 按 RSS 源配置决定是否先抓全文
- 基于标题 + 摘要或全文执行全局关键词过滤和全局 AI 过滤
- 把过滤结果持久化到 `articles`
- Reader 与 AI 解读统一只消费未过滤文章

优点：

- 与“数据库保留但默认不显示”完全一致
- 与“配置只影响新文章，不回刷历史”完全一致
- Reader 与 AI 解读共享同一份过滤事实
- 可平滑扩展错误诊断与过滤标签

代价：

- 需要新增数据字段、过滤任务与查询条件

结论：采用方案 C。

## 推荐方案

采用“入库后持久化过滤结果”的统一状态机：

1. RSS 抓取到新文章后先入库
2. 文章进入过滤评估阶段
3. 若所属 RSS 源开启 `fullTextOnFetchEnabled`，先尝试抓全文
4. 基于标题 + 摘要或全文，依次执行：
   - 全局关键词过滤
   - 全局 AI 提示词过滤
5. 将最终结果写回文章记录
6. Reader 默认只显示未过滤文章
7. AI 解读候选只纳入未过滤文章
8. 当用户在单个 RSS 源开启“查看已过滤文章”时，该 RSS 源的 Reader 列表才临时展示全部文章并标记已过滤状态

## 已确认设计

### 1. 配置模型

#### 1.1 全局过滤配置

现有 `PersistedSettings.rss.articleKeywordFilter` 不再只是 Reader 层临时过滤设置，而是升级为全局文章过滤策略配置。

建议重构为：

```ts
rss: {
  articleFilter: {
    keyword: {
      enabled: boolean;
      keywords: string[];
    };
    ai: {
      enabled: boolean;
      prompt: string;
    };
  };
}
```

说明：

- 关键词过滤与 AI 过滤都直接作用于所有 `rss` feed
- 不再保留 `feedKeywordsByFeedId`
- 若当前已有全局关键词数据，需要在配置迁移时保留到 `keyword.keywords`
- 若当前存在 `feedKeywordsByFeedId` 历史数据，第一版直接废弃，不继续沿用

#### 1.2 RSS 源级全文配置

保留现有：

- `fullTextOnOpenEnabled`
  - 打开文章时自动抓取全文

新增：

- `fullTextOnFetchEnabled`
  - 新文章入库后自动抓取全文

职责边界：

- `fullTextOnOpenEnabled` 只影响阅读时机
- `fullTextOnFetchEnabled` 只影响入库/过滤时机

过滤是否使用全文的规则固定为：

- `fullTextOnFetchEnabled === true`
  - 过滤优先使用全文
- `fullTextOnFetchEnabled === false`
  - 过滤只使用标题 + 摘要

不再新增单独的“过滤前抓全文”开关，避免与全文抓取策略重复配置。

### 2. 数据模型

建议在 `articles` 表新增以下字段：

- `filter_status text not null default 'passed'`
- `is_filtered boolean not null default false`
- `filtered_by text[] not null default '{}'::text[]`
- `filter_evaluated_at timestamptz null`
- `filter_error_message text null`

其中 `filter_status` 允许的取值为：

- `pending`
- `passed`
- `filtered`
- `error`

建议增加约束：

- `constraint articles_filter_status_check check (filter_status in ('pending', 'passed', 'filtered', 'error'))`

建议增加索引：

- `(feed_id, is_filtered, published_at desc, id desc)`
- 如 AI 解读候选查询存在独立 SQL，可再按实际 where 条件补索引

字段语义：

- `pending`
  - 文章已入库，但过滤评估尚未完成
- `passed`
  - 已完成过滤评估，文章未命中过滤规则
- `filtered`
  - 已完成过滤评估，文章命中过滤规则
- `error`
  - 过滤过程失败，但按“默认显示”策略放行

额外约束：

- `is_filtered = true` 时，`filter_status` 必须为 `filtered`
- `filter_status in ('passed', 'error')` 时，`is_filtered = false`

第一版不强制在数据库层用复杂 `check` 表达这组对应关系，可先在应用层统一写入，保持 migration 简洁。

### 3. 过滤状态机

新文章的生命周期建议为：

1. RSS 抓取成功后，文章先入库
2. 初始写入：
   - `filter_status = 'pending'`
   - `is_filtered = false`
   - `filtered_by = []`
3. 若所属 RSS 源开启 `fullTextOnFetchEnabled`
   - 优先抓全文
4. 选择过滤输入：
   - 有全文则使用全文
   - 无全文则回退为标题 + 摘要
5. 执行全局关键词过滤
6. 执行全局 AI 提示词过滤
7. 合并结果并写回文章：
   - 任一规则命中：`filtered`
   - 全部未命中：`passed`
   - AI 调用失败且未命中关键词：`error`

#### 3.1 合并规则

- 关键词命中 + AI 命中：
  - `filter_status = 'filtered'`
  - `is_filtered = true`
  - `filtered_by = ['keyword', 'ai']`
- 仅关键词命中：
  - `filtered`
- 仅 AI 命中：
  - `filtered`
- 都未命中：
  - `passed`
- AI 过滤失败，且关键词未命中：
  - `error`
- 全文抓取失败：
  - 不写 `error`
  - 直接回退标题 + 摘要继续过滤

#### 3.2 `pending` 的显示语义

`pending` 只作为短暂内部态存在：

- Reader 默认不显示 `pending`
- AI 解读候选也不纳入 `pending`

原因：

- 避免文章先出现在中栏，几秒后又因过滤结果被移除
- 保持“是否显示由过滤结果决定”的体验一致性

### 4. 抓取与任务链路

#### 4.1 RSS 抓取链路

当前 `worker/index.ts` 会在抓到新文章后直接：

- `insertArticleIgnoreDuplicate(...)`
- 按 feed 配置触发自动摘要 / 自动翻译

本次应调整为：

1. 新文章入库时写入 `pending` 过滤状态
2. 为新文章投递过滤任务
3. 自动摘要、自动翻译不再直接在入库后触发
4. 改为等待过滤任务完成，并且文章不是 `filtered` 后再触发

这样可以保证：

- 被过滤文章不会进入自动摘要 / 自动翻译链路
- 与“AI 解读不纳入”保持一致

#### 4.2 新增过滤任务

建议新增独立任务类型，例如：

- `article.filter`

任务职责：

- 读取文章、feed 配置、全局过滤配置
- 必要时触发全文抓取并等待结果
- 执行关键词过滤与 AI 过滤
- 写回最终过滤结果
- 若最终不是 `filtered`，再触发现有自动摘要 / 自动翻译逻辑

不建议把过滤逻辑直接塞回 RSS 抓取循环内，原因：

- AI 过滤会引入外部网络延迟
- 全文抓取本身已有异步链路
- 把过滤拆成独立任务更容易控制重试与错误边界

#### 4.3 过滤与全文抓取的关系

当 `fullTextOnFetchEnabled` 开启时：

- 过滤任务先尝试抓全文
- 成功后基于全文过滤
- 失败时回退到标题 + 摘要

当 `fullTextOnFetchEnabled` 未开启时：

- 不主动抓全文
- 直接基于标题 + 摘要过滤

### 5. Reader 查询与 API 契约

#### 5.1 Reader snapshot 查询规则

当前 Reader snapshot 只在服务端用关键词规则临时跳过文章。  
本次改为基于文章过滤状态做查询条件。

默认查询规则：

- 只返回 `filter_status in ('passed', 'error')`
- 排除：
  - `pending`
  - `filtered`

`error` 默认可见的原因：

- 你已确认 AI 过滤失败时默认显示

#### 5.2 `includeFiltered` 参数

给 `GET /api/reader/snapshot` 增加可选参数：

- `includeFiltered?: boolean`

行为：

- 默认 `false`
- 仅当 `view` 是单个 `rss` feed 且前端显式开启时，才传 `true`

服务端处理规则：

- `includeFiltered = false`
  - 返回 `passed + error`
- `includeFiltered = true`
  - 返回 `passed + error + filtered`
  - 仍排除 `pending`

不建议在聚合视图中支持 `includeFiltered`，避免语义膨胀。

#### 5.3 Snapshot DTO 与文章详情 DTO

建议在 Reader snapshot 和文章详情接口都返回过滤状态字段：

- `filterStatus`
- `isFiltered`
- `filteredBy`

原因：

- 中栏需要给已过滤文章渲染标记
- 右栏打开已过滤文章时也需要显示状态
- 前端不应自行猜测过滤状态

### 6. Reader 前端交互

#### 6.1 右键入口

在 RSS 源现有右键菜单中新增一项切换操作：

- 未开启时：`查看已过滤文章`
- 已开启时：`隐藏已过滤文章`

仅对 `rss` feed 展示，不对 `ai_digest` feed 展示。

建议与过滤相关配置放在同一组，例如靠近：

- `全文抓取配置`
- `AI 摘要配置`
- `翻译配置`
- `文章过滤配置`

#### 6.2 前端状态

在 store 中新增按 feed 维度维护的临时显示状态，例如：

- `showFilteredByFeedId: Record<string, boolean>`

行为：

- 默认全部为 `false`
- 切换某个 feed 时只影响该 feed
- 切换后重新 `loadSnapshot({ view: feedId })`
- 请求时透传 `includeFiltered`

这样可与现有 `articleSnapshotCache` 模型兼容，不影响其他视图。

#### 6.3 中栏展示

当用户在某个 RSS 源开启“查看已过滤文章”后：

- 中栏显示该 RSS 源全部文章
- 对 `filtered` 文章加明显标记，例如 `已过滤`
- 视觉上略微降权，但仍然保持可读、可点击

不建议把已过滤文章灰掉过重，也不建议禁止点击，因为用户既然主动开启查看，就应允许在右栏正常阅读文章。

#### 6.4 右栏展示

已过滤文章在右栏应允许正常打开，不做额外拦截。

建议第一版只增加轻量状态标记，不增加复杂解释：

- `已过滤`

这样可以满足识别需求，同时保持阅读视图简洁。

### 7. 未读统计与 AI 解读

#### 7.1 未读统计

已过滤文章不计入：

- feed `unreadCount`
- `unread` 视图

即使当前 RSS 源开启了“查看已过滤文章”，这一统计口径仍不变化。

原因：

- 避免出现“默认看不见，但未读数始终存在”的冲突体验

#### 7.2 AI 解读候选

AI 解读候选查询统一只纳入：

- `passed`
- `error`

排除：

- `pending`
- `filtered`

原因：

- `filtered` 明确不纳入 AI 解读
- `pending` 尚未得出过滤结果，不能提前进入候选
- `error` 按“默认显示”策略放行

### 8. 错误处理

#### 8.1 AI 过滤失败

当 AI 过滤请求失败、超时或返回无效结果时：

- 文章不回滚
- `filter_status = 'error'`
- `is_filtered = false`
- 记录 `filter_error_message`
- Reader 默认显示
- AI 解读可纳入

这符合“过滤失败时默认显示”的已确认输入。

#### 8.2 全文抓取失败

当 `fullTextOnFetchEnabled` 开启但全文抓取失败时：

- 不把文章标记为 `error`
- 直接回退到标题 + 摘要继续过滤

原因：

- 全文抓取失败不等于过滤失败
- 不应因为正文站点异常而阻断文章可见性

#### 8.3 过滤任务失败

若过滤任务在应用层发生未预期异常：

- 兜底写 `filter_status = 'error'`
- 文章默认显示

目标是：任何过滤阶段的异常都不能导致文章永久卡在 `pending`。

### 9. 迁移策略

#### 9.1 历史文章

历史文章不补跑过滤，统一初始化为：

- `filter_status = 'passed'`
- `is_filtered = false`
- `filtered_by = []`

理由：

- 避免历史列表在升级后大面积变化
- 避免一次性高成本 AI 回填
- 与“新规则只影响之后新文章”一致

#### 9.2 设置迁移

配置迁移建议为：

- 保留现有全局关键词列表，映射到新结构的 `articleFilter.keyword.keywords`
- 新增：
  - `articleFilter.keyword.enabled`
  - `articleFilter.ai.enabled`
  - `articleFilter.ai.prompt`
- 废弃 `feedKeywordsByFeedId`

第一版不需要为已存在的 feed 级关键词规则做兼容渲染或迁移展示。

#### 9.3 Feed 配置迁移

新增 feed 字段：

- `full_text_on_fetch_enabled boolean not null default false`

前端与 API 同步新增：

- `fullTextOnFetchEnabled`

默认值为 `false`，不改变现有 feed 行为。

### 10. 测试策略

遵循 TDD，先补失败测试，再做最小实现。

#### 10.1 后端

过滤任务：

- 新文章入库后初始为 `pending`
- 关键词命中时写成 `filtered`
- AI 命中时写成 `filtered`
- 两者都未命中时写成 `passed`
- AI 过滤失败时写成 `error`
- `fullTextOnFetchEnabled` 开启时优先用全文
- 全文抓取失败时回退标题 + 摘要

Reader snapshot：

- 默认排除 `pending` 与 `filtered`
- 单 RSS 源且 `includeFiltered = true` 时返回 `filtered`
- 聚合视图即使传入 `includeFiltered` 也不放开 `filtered`

AI 解读候选：

- 排除 `pending` 与 `filtered`
- 保留 `passed` 与 `error`

迁移：

- 历史文章 migration 后默认全部为 `passed`
- 新增 `full_text_on_fetch_enabled` 默认值正确

#### 10.2 前端

Feed 右键菜单：

- RSS 源可切换“查看已过滤文章 / 隐藏已过滤文章”
- `ai_digest` 源不显示该入口

Store / snapshot：

- 单个 feed 开启后，请求会带 `includeFiltered`
- 切换其他 feed 不会串改当前开关状态

中栏：

- 已过滤文章显示 `已过滤` 标记
- 已过滤文章仍可点击并打开详情

未读统计：

- 已过滤文章不计入 `unreadCount`
- `unread` 视图不展示已过滤文章

## 验收标准

- 新文章过滤结果持久化到数据库，而不是只在 Reader 层临时跳过
- 支持全局关键词过滤与全局 AI 提示词过滤
- RSS 源支持配置 `fullTextOnFetchEnabled`
- 当 `fullTextOnFetchEnabled` 开启时，过滤优先基于全文
- 被过滤文章保存在数据库中，但 Reader 默认不显示
- 被过滤文章不进入 AI 解读候选
- 用户可在单个 RSS 源右键开启“查看已过滤文章”
- 开启后中栏显示全部文章，并为已过滤文章打标
- 已过滤文章不计入未读统计，也不进入未读视图
- 修改过滤配置后不影响历史文章，只影响新文章
- AI 过滤失败时文章默认显示

## 风险与缓解

- 风险：过滤任务延迟会让新文章出现得比现在更慢
  - 缓解：`pending` 只作为短态存在；任务队列与重试策略要保持轻量

- 风险：全文抓取或 AI 过滤失败导致文章长期卡在 `pending`
  - 缓解：任何失败都必须兜底写成 `error` 或回退过滤，不能无限停留在 `pending`

- 风险：Reader、未读统计、AI 解读三个入口使用不同过滤条件，导致结果漂移
  - 缓解：统一围绕 `filter_status / is_filtered` 建查询约束，不再各自临时计算

- 风险：旧的 `feedKeywordsByFeedId` 语义与新设计冲突
  - 缓解：迁移时明确废弃，只保留全局关键词列表，避免半兼容状态
