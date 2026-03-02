# Feed 维度文章显示模式设计（中栏卡片/列表切换）

日期：2026-03-02  
状态：已评审通过（待实施计划）

## 1. 背景与目标

当前中栏 `ArticleList` 仅支持卡片样式。目标是在**具体 RSS 源视图**下支持两种模式切换：

- `card`：现有卡片样式（保持不变）
- `list`：列表样式，仅显示“左侧标题 + 右侧时间”

并满足以下约束：

- 显示模式按 RSS 源（`feed`）维度持久化
- `all` / `unread` / `starred` 三个聚合视图固定 `card`
- 具体 RSS 源首次进入默认 `card`
- `list` 模式保留日期分组标题（今天/昨天/具体日期）
- `list` 模式保留未读视觉标记
- 切换按钮位于中栏 header，放在刷新按钮左侧
- 聚合视图隐藏切换按钮

## 2. 方案选择

已选择方案：在 `feeds` 增加字段并走现有 `feed` 配置链路。

原因：

- 与现有 `fullTextOnOpenEnabled` / `aiSummaryOnOpenEnabled` 一致
- 语义正确（属于 feed 配置）
- 可跨设备一致，不依赖本地状态

## 3. 数据模型设计

### 3.1 数据库

在 `feeds` 表新增列：

- `article_list_display_mode text not null default 'card'`

约束建议：

- 增加 `check` 约束，限制为 `('card', 'list')`

### 3.2 前后端类型

- `FeedRow` 增加 `articleListDisplayMode: 'card' | 'list'`
- `ReaderSnapshotDto.feeds[]` 增加 `articleListDisplayMode`
- 前端 `Feed` 类型增加 `articleListDisplayMode`
- `patchFeed` 输入增加可选字段 `articleListDisplayMode?: 'card' | 'list'`

## 4. API 与仓储改动

### 4.1 Repository (`feedsRepo`)

以下方法补齐字段读写：

- `listFeeds`
- `createFeed`
- `updateFeed`

### 4.2 API 路由

- `PATCH /api/feeds/[id]`
  - `zod` schema 增加 `articleListDisplayMode` 枚举校验
  - 返回体包含更新后的该字段
- `GET /api/reader/snapshot`
  - `feeds[]` 返回该字段，供中栏渲染使用

### 4.3 映射层

- `mapFeedDto` 映射 `articleListDisplayMode`

## 5. 前端交互与渲染

### 5.1 显示模式决策

在 `ArticleList` 内计算有效模式：

- 若 `selectedView` 是具体 `feedId`：
  - 使用该 `feed.articleListDisplayMode`（非法值回退 `card`）
- 若 `selectedView` 是 `all` / `unread` / `starred`：
  - 强制 `card`

### 5.2 切换按钮

- 位置：header 中刷新按钮左侧
- 仅 `feed` 视图渲染；聚合视图不显示
- 点击行为：
  1. 乐观更新本地该 feed 的 `articleListDisplayMode`
  2. 调用 `patchFeed(feedId, { articleListDisplayMode: nextMode })`
  3. 失败则回滚并提示错误

### 5.3 列表模式 UI

- 行高改为紧凑单行
- 主结构：左侧标题（单行截断） + 右侧相对时间（`formatRelativeTime`）
- 保留未读标记（小圆点/强调色）
- 保留日期分组标题（`articleSections` 逻辑不变）

## 6. 错误处理与兼容策略

- API 校验失败：返回 `ValidationError`（字段级提示）
- 保存失败：中栏回滚到旧模式，并通过通知系统显示错误
- 历史数据兼容：
  - DB 默认值保证存量数据为 `card`
  - 前端对缺失/非法值做 `card` 回退，避免渲染异常

## 7. 测试设计

### 7.1 前端单测（`ArticleList.test.tsx`）

- feed 视图显示切换按钮，聚合视图隐藏
- 点击切换后从 `card` 渲染到 `list`
- `list` 模式下仍展示未读标记与时间
- 接口失败时回滚到切换前模式并触发错误通知

### 7.2 API / Repository 测试

- `feedsRepo`：`list/create/update` 覆盖新字段
- `PATCH /api/feeds/[id]`：枚举校验、更新成功返回字段
- `reader snapshot` 返回包含 `articleListDisplayMode`

### 7.3 Migration 测试

- 校验 migration SQL 包含新增列、默认值、约束（若加 `check`）

## 8. 验收标准

满足以下即视为完成：

1. 在具体 feed 视图可切换 `card/list`，聚合视图不可切换且无按钮
2. 切换后刷新页面仍保留该 feed 的模式
3. `list` 模式为“左标题右时间”，并保留未读标记与日期分组
4. 失败场景可回滚并向用户提示
5. 新增与变更测试通过

## 9. 非目标（本次不做）

- 不为 `all/unread/starred` 提供可配置模式
- 不引入第三种显示模式
- 不调整右栏 `ArticleView` 交互
