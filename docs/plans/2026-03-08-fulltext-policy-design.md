# 全文抓取配置与右栏手动触发设计

## 背景

当前全文抓取能力只暴露了一个 feed 级自动规则 `fullTextOnOpenEnabled`，并在阅读器中于打开文章时自动触发。与 `AI 摘要`、`翻译` 相比，全文抓取缺少两个关键产品入口：

- 缺少独立、可理解的 feed 级配置入口
- 缺少阅读器右栏中的手动触发入口

这导致全文抓取虽然存在能力，但用户难以理解如何启用、何时触发，以及在自动策略关闭时如何主动补抓。

## 目标

- 为全文抓取补齐与 `AI 摘要`、`翻译` 一致的 feed 级配置入口
- 仅保留一种自动规则：`打开文章时自动抓取全文`
- 在阅读器右栏提供常驻的手动 `抓取全文` 入口
- 保持现有数据模型的稳定性，不新增数据库字段，不引入新的全局 `RSS` 配置项

## 非目标

- 不新增“收到新文章时自动抓取全文”策略
- 不将全文抓取并入全局 `RSS 设置`
- 不把全文抓取配置合并进 `AI 摘要配置`
- 不在本次设计中扩展“已有全文时强制重新抓取”的新语义

## 现状与代码落点

- `src/types/index.ts`
  - `Feed` 已有 `fullTextOnOpenEnabled`
- `src/features/articles/ArticleView.tsx`
  - 已存在打开文章时自动触发全文抓取的逻辑
  - 已存在全文抓取中的状态提示块
  - 目前没有右栏手动 `抓取全文` 按钮
- `src/features/feeds/FeedList.tsx`
  - 已有 `AI摘要配置`、`翻译配置` 等 feed 右键菜单入口
  - 目前没有 `全文抓取配置` 入口
- `src/app/api/feeds/[id]/route.ts`
  - 已支持保存 `fullTextOnOpenEnabled`
- `src/app/api/articles/[id]/fulltext/route.ts`
  - 当前自动触发与接口调用耦合，若 feed 未开启 `fullTextOnOpenEnabled` 则不会入队

## 方案对比

### 方案一：新增独立的全文抓取配置入口（推荐）

- 在 feed 右键菜单新增 `全文抓取配置`
- 新增独立 `FeedFulltextPolicyDialog`
- 右栏新增常驻 `抓取全文` 按钮

优点：

- 与 `AI摘要配置`、`翻译配置` 的信息架构一致
- 改动边界清晰，复用现有弹窗模式，风险最低
- 全文抓取的自动规则与手动动作语义更清楚

缺点：

- 菜单中多一个入口

### 方案二：把全文抓取开关并入 AI 摘要配置

优点：

- 配置入口更少

缺点：

- 全文抓取与摘要是不同能力，混放会削弱配置语义
- 后续扩展全文抓取策略时会继续加重弹窗复杂度

### 方案三：放进全局 RSS 设置

优点：

- 入口最少

缺点：

- 与当前 feed 级 `AI 摘要` / `翻译` 策略模型不一致
- 用户无法按订阅源细粒度控制全文抓取行为

结论：采用方案一。

## 设计概览

### 1. 配置入口

在 `src/features/feeds/FeedList.tsx` 的 feed 右键菜单中新增一项：

- `全文抓取配置`

该入口与 `AI摘要配置`、`翻译配置` 同级，打开新的 `FeedFulltextPolicyDialog`。

### 2. 配置弹窗

新增 `FeedFulltextPolicyDialog`，结构对齐现有策略弹窗：

- 标题：`全文抓取配置`
- 描述：`仅保存自动触发规则，现在不会立即抓取全文。`
- 单一开关：`打开文章时自动抓取全文`
- 开关描述：`打开文章后会自动加入全文抓取队列。`

保存时仅提交：

- `fullTextOnOpenEnabled: boolean`

不新增任何新的设置字段。

### 3. 阅读器右栏动作区

在 `src/features/articles/ArticleView.tsx` 的右栏动作区新增一个常驻按钮：

- 按钮文案：`抓取全文`

交互约束：

- 按钮与 `生成摘要`、`翻译` 并列
- 按钮默认常驻显示，不依赖失败态才出现
- 当全文任务处于 `queued/running` 时按钮禁用，避免重复点击
- 抓取中继续沿用现有提示：`正在抓取全文，完成后会自动更新`

## 数据流设计

### 自动触发

自动触发仍由 `ArticleView` 在打开文章时触发，前提为：

- 当前文章存在 `article.id`
- feed 的 `fullTextOnOpenEnabled === true`
- 文章存在可抓取的 `link`
- 文章当前尚未拥有完整全文，且不满足“RSS 内容已足够完整”的跳过条件

### 手动触发

右栏 `抓取全文` 按钮点击后，复用与自动触发相同的抓取与轮询流程，但触发来源改为用户显式动作。

推荐将现有全文抓取逻辑抽为统一请求函数，例如概念上：

- `requestFulltext(articleId, { signal, force })`

其中：

- 自动触发使用 `force: false`
- 手动触发使用 `force: true`

这样可以避免自动/手动两套近似逻辑分叉。

## API 语义调整

### 现状问题

当前 `src/app/api/articles/[id]/fulltext/route.ts` 会在入队前检查 feed 的 `fullTextOnOpenEnabled`。这会导致：

- 当自动规则关闭时，前端即使提供了手动按钮，也无法真正触发全文抓取

### 推荐方案

继续复用现有接口：

- `POST /api/articles/[id]/fulltext`

但增加可选请求体语义：

- `{ force: true }`

服务端规则：

- `force: false` 或未传：沿用自动规则，仅在 `fullTextOnOpenEnabled === true` 时允许自动入队
- `force: true`：忽略 `fullTextOnOpenEnabled`，允许用户手动触发全文抓取

其余去重与保护逻辑保持不变：

- 无 `link` 不入队
- 已有 `contentFullHtml` 不重复入队
- RSS 内容已足够完整时不重复入队
- 队列层继续负责幂等与去重

## 错误处理与兼容性

### 错误处理

- 若文章没有 `link`，手动点击后不进入 loading 假状态
- 若文章已有完整全文，不额外引入“强制重抓”能力，沿用当前不重复入队逻辑
- 若任务已处于 `queued/running`，前端按钮禁用，减少重复操作
- 若抓取失败，沿用现有任务状态和错误展示模式，不新增新的状态机

### 兼容性

- 保留数据库字段 `full_text_on_open_enabled` 不变
- 保留前端 `Feed.fullTextOnOpenEnabled` 不变
- 不新增数据库迁移
- 不修改全局 `settings` 结构

## 测试设计

### 前端

- `src/features/feeds/FeedPolicyDialogs.test.tsx`
  - 新增全文策略弹窗测试
  - 断言保存时提交 `{ fullTextOnOpenEnabled: true }`
- `src/features/feeds/FeedList.test.tsx`
  - 新增 feed 右键菜单打开 `全文抓取配置` 的测试
- `src/features/articles/ArticleView` 相关测试
  - 未开启自动抓取时，右栏仍可手动触发全文抓取
  - 全文抓取进行中时，按钮禁用并展示抓取中提示
  - 手动触发后轮询成功会刷新文章内容

### API / 服务端

- `src/app/api/articles/[id]/fulltext/route.ts` 对应测试
  - `force: true` 时，即使 `fullTextOnOpenEnabled === false` 也允许入队
  - `force: false` 时，仍受 `fullTextOnOpenEnabled` 控制
- 如需要，补充 `src/lib/apiClient.test.ts`
  - 验证 `enqueueArticleFulltext(articleId, { force: true })` 的请求体

## 实施边界

本设计只覆盖以下范围：

- 新增 feed 级 `全文抓取配置` 入口和弹窗
- 新增阅读器右栏 `抓取全文` 按钮
- 调整全文抓取 API 以区分自动触发与手动触发
- 补充相关单元测试

本设计不包含：

- 全文抓取结果展示样式改造
- 全文重抓历史或强制刷新策略
- 与 AI 摘要、翻译的联动产品化调整

## 最终结论

采用与 `AI 摘要`、`翻译` 相同的信息架构，为全文抓取补齐：

- feed 级 `全文抓取配置`
- 唯一自动规则 `打开文章时自动抓取全文`
- 阅读器右栏常驻 `抓取全文` 按钮
- 接口层 `force` 语义，用于区分自动触发与手动触发

该方案在不引入新数据库字段和全局设置复杂度的前提下，补齐全文抓取的可发现性、可配置性与可操作性。
