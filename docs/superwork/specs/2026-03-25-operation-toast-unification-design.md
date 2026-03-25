# 操作通知统一设计

## 背景

当前 FeedFuse 已有一套基础 toast 能力，但“用户操作通知”仍然分散在多个层面：

- 前端组件和 hooks 中散落着手工 `toast.success`、`toast.info`、`toast.error`
- `apiClient` 会通过 `notifyApiError` 自动弹出部分失败提示
- 异步任务的开始、进行中、最终完成之间没有统一通知语义
- 系统日志当前更偏向后台任务和外部调用生命周期，缺少“用户直接触发操作”的统一记录

这导致几个明确问题：

- 同一操作可能出现重复 toast，或者成功走手工 toast、失败走 `apiClient` 自动 toast，来源不一致
- 异步任务有的在提交时提示，有的在轮询完成时提示，有的失败只留在局部状态，没有统一规则
- 失败原因文案和日志文案常常不一致，不利于排查
- 很多“用户直接触发并打到后端”的操作没有进入现有系统日志面板

本次需求是把“用户直接触发的后端操作通知”彻底收口：所有此类操作都必须通过 toast 通知，同时写入现有系统日志。

## 已确认约束

- 只覆盖“用户明确触发，且会和后端交互”的操作
- 纯前端状态切换不纳入范围，例如：
  - 展开/收起侧栏或分类
  - 切换文章
  - 打开/关闭弹窗
- 页面初始化加载、切换视图后的被动读取、滚动分页、后台轮询不弹 toast
- 日志直接进入现有系统日志列表，对用户可见
- 日志严格遵循现有 `logging.enabled` 和 `logging.minLevel`
- 不新增 `warning`，toast tone 只保留：
  - `success`
  - `info`
  - `error`
- `success` 不显示原因
- `error` 必须显示简短原因
- 异步操作允许最多两次通知：
  - 第一次：用户点击后提示任务已开始，使用 `info`
  - 第二次：任务最终成功或失败，使用 `success` 或 `error`
- 异步操作的中间态不弹错误，不单独弹进行中提示，例如：
  - `queued`
  - `running`
  - `already_running`
  - `fulltext_pending`
- 用户刷新页面、切换路由或重新打开应用后，不补发之前未展示的 toast
- 所有 toast 对应的操作结果都必须写入日志

## 目标

- 统一所有“用户直接触发的后端操作”的 toast 生命周期
- 让同步操作只弹一次，异步操作最多弹两次，且规则稳定
- 让 toast 与系统日志使用统一的操作语义和文案边界
- 让失败原因足够短、足够稳定、足够可读
- 为后续新增操作提供统一接入方式，避免继续散落手工 toast

## 非目标

- 不改造纯前端交互提示
- 不把被动读取请求纳入全局 toast
- 不实现跨刷新、跨会话的通知补发
- 不实现通用 queue 观察中心
- 不在本次设计中引入浏览器推送、系统通知或桌面通知
- 不把现有系统日志面板改造成时间线式通知中心

## 方案对比

### 方案 A：继续保留分散 toast，只补约定

做法：

- 保留现有 `toast.success/error/info`
- 只通过规范要求各处手工统一调用

优点：

- 改造量最小
- 不需要新增中间层

缺点：

- 无法从结构上防止重复 toast
- 异步任务仍然容易出现“开始、失败、轮询完成”三套逻辑各自为政
- 日志落点仍会继续分散

### 方案 B：把通知逻辑塞进 `apiClient`

做法：

- 扩展 `apiClient`，让每个请求都能声明成功/失败文案
- 由请求层统一决定 toast

优点：

- 同步请求可以较快收口
- 失败 transport 提示与业务提示能在一层统一

缺点：

- `apiClient` 无法天然知道异步任务最终成功还是失败
- 容易把“请求已接受”和“操作已完成”混为一谈
- 对日志和业务分类支持较差

### 方案 C：新增“用户操作通知编排层”，同步前端 toast 与服务端日志

做法：

- 新增共享的操作目录与前端 notifier，统一管理 toast 生命周期
- 服务端新增用户操作日志 helper，把同步操作和异步任务结果写入现有系统日志
- 文章 AI 任务复用现有 session / task 状态
- AI digest 和手动 refresh 补齐最小最终态观察能力

优点：

- 最符合“统一所有操作通知”的目标
- 同步与异步能共享同一套操作语义
- toast 和日志都能按“用户操作最终结果”对齐
- 后续新增操作只需接入操作目录，不必重复发明文案规则

缺点：

- 首轮需要梳理所有用户直接触发入口
- 需要补齐少数异步场景的最终态接口

## 结论

采用方案 C：新增“用户操作通知编排层”，由前端统一控制 toast，由服务端统一记录日志，并按业务对象补齐异步最终态观察能力。

## 总体架构

本次设计拆成四层，但不做大重构：

1. 共享操作目录层
- 新增一个共享的操作目录模块，例如 `src/lib/userOperationCatalog.ts`
- 定义每个操作的稳定 `actionKey`、分类、文案模板和同步/异步模式

2. 前端通知编排层
- 新增 `src/features/notifications/userOperationNotifier.ts`
- 负责：
  - 同步操作的一次性通知
  - 异步操作的“开始一次 + 最终一次”
  - 客户端内存级 operation registry
  - 去重和终态保护

3. 服务端用户操作日志层
- 新增 `src/server/logging/userOperationLogger.ts`
- 在同步 API、异步接受入口、异步 worker 最终态里统一写系统日志
- 严格复用现有 `writeSystemLog(...)`

4. 业务状态观察层
- 已有文章 AI 总结、AI 翻译继续复用现有 session / task 状态
- AI digest 暴露 run status 查询接口
- 手动刷新单 feed / 全部 feed 补充用户触发级 refresh run 状态

该架构的关键原则是：

- toast 关注“这次用户操作在界面上该如何反馈”
- 日志关注“这次用户操作在系统里发生了什么”
- 请求层只负责 transport 和 API envelope，不负责最终用户操作编排

## 操作模型

每个纳入统一通知的用户操作都定义一份稳定的操作元数据：

- `actionKey`
  例如：
  - `feed.create`
  - `feed.update`
  - `feed.refresh`
  - `feed.refreshAll`
  - `article.markRead`
  - `article.toggleStar`
  - `article.aiSummary.generate`
  - `article.aiTranslate.generate`
  - `aiDigest.generate`
  - `settings.save`
  - `opml.import`
- `mode`
  - `immediate`
  - `deferred`
- `category`
  写入系统日志时使用的业务分类
- `startMessage`
  仅异步操作使用，例如“已开始刷新订阅源”
- `successMessage`
  例如“已添加订阅源”
- `errorMessage`
  失败前缀，例如“添加订阅源失败”
- `source`
  记录触发来源，例如组件、store action 或 API route

为了保证一次操作不会重复出结果，前端 notifier 需要为每次点击生成一次 `operationId`，并维护内存状态：

- `pending`
- `started`
- `succeeded`
- `failed`

规则如下：

- 同一个 `operationId` 只能进入一个最终态
- 同一个 `operationId` 的开始态只允许通知一次
- 同一个 `operationId` 的最终结果只允许通知一次
- 页面刷新后 registry 清空，不重建历史 operation

## Toast 规则

### 同步操作

同步操作只允许一次 toast：

- 请求最终成功：弹 `success`
- 请求最终失败：弹 `error`

展示规则：

- `success`：只显示结果，不显示原因
- `error`：显示“失败前缀 + 简短原因”

示例：

- `已更新订阅源`
- `删除分类失败：分类仍有关联订阅源`

### 异步操作

异步操作最多允许两次 toast：

1. 用户点击后，任务被系统接受并开始跟踪时，弹一次 `info`
2. 任务最终结束时，再弹一次 `success` 或 `error`

展示规则：

- `info`：只用于“已开始”，通常不拼接原因
- `success`：只显示成功结果
- `error`：显示失败前缀和短原因

示例：

- `已开始生成 AI 摘要`
- `AI 摘要已生成`

或：

- `已开始刷新全部订阅源`
- `刷新全部订阅源失败：2 个订阅源刷新失败`

### 中间态规则

以下状态都不允许弹 `error`，也不允许额外冒出第二个 `info`：

- `queued`
- `running`
- `already_running`
- `fulltext_pending`
- 前置依赖准备中

对用户来说，中间态只能折叠到“已开始”这一条 toast 里。

## 日志规则

系统日志使用现有 `system_logs` 表，不新增第二套通知历史。

日志等级固定映射如下：

- 异步开始通知：`info`
- 同步成功通知：`info`
- 异步最终成功通知：`info`
- 同步失败通知：`error`
- 异步最终失败通知：`error`

日志记录规则如下：

- 同步操作写 1 条日志
  - 成功或失败二选一
- 异步操作写 2 条日志
  - 开始 1 条 `info`
  - 最终成功或失败 1 条

日志必须遵循现有设置：

- `logging.enabled = false` 时不写
- `logging.minLevel = error` 时跳过开始和成功日志
- `logging.minLevel = info` 时全部写入

为了让用户操作更容易检索，建议扩展 `SystemLogCategory`：

- `feed`
- `category`
- `article`
- `opml`
- `settings`
- `ai_summary`
- `ai_translate`
- `ai_digest`
- `external_api`

日志 `context` 中建议统一补充：

- `actionKey`
- `operationMode`
- `operationStage`
  - `started`
  - `finished`
- `operationOutcome`
  - `success`
  - `error`
- `operationId`
  前端触发生成的 ID；仅用于相关链路透传时记录

## 服务端日志策略

为保证日志不依赖当前页面是否仍然存活，服务端必须成为日志的权威落点。

建议新增 `userOperationLogger` helper，统一输出：

- `writeUserOperationStartedLog(...)`
- `writeUserOperationSucceededLog(...)`
- `writeUserOperationFailedLog(...)`

使用原则：

- 同步操作：
  - 在 API route 成功返回前写成功日志
  - 在可控失败分支写失败日志
- 异步操作：
  - 在接受用户请求、成功创建或绑定跟踪对象时写开始日志
  - 在 worker / session finalizer 中写最终成功或失败日志

这样可以保证：

- 日志不会因为页面刷新而丢失
- 系统日志列表能稳定看到异步操作最终结果
- toast 与日志虽然分别在前后端产生，但语义一致

## 异步状态观察设计

### 文章 AI 摘要

复用现有状态：

- `sessionId`
- snapshot
- SSE 事件

前端规则：

- 请求被接受时立刻弹 `已开始生成 AI 摘要`
- 在 `session.completed` 时弹 `AI 摘要已生成`
- 在 `session.failed` 时弹 `生成 AI 摘要失败：<reason>`

服务端规则：

- API route 接受请求时写开始日志
- AI summary worker 最终成功/失败时写最终日志

### 文章 AI 翻译

复用现有状态：

- `sessionId`
- snapshot
- SSE 事件

前端规则：

- 点击翻译或重试分段时立刻弹开始 `info`
- 会话最终成功时弹 `success`
- 会话最终失败时弹 `error`

服务端规则：

- 接受请求时写开始日志
- 翻译 session 最终成功/失败时写最终日志

### AI digest 手动生成

当前系统已有 `ai_digest_runs`，但前端还没有 run status 查询口。

建议新增：

- `GET /api/ai-digests/runs/[runId]`

返回最小字段：

- `id`
- `status`
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
- `errorCode`
- `errorMessage`
- `updatedAt`

前端规则：

- 点击后请求返回 `runId` 时立即弹开始 `info`
- 轮询或订阅 `runId` 最终态
- `succeeded` 时弹 `AI 解读已生成`
- `failed` 时弹 `生成 AI 解读失败：<reason>`

如果后端发现当前窗口已有运行中的 `runId`，不视为错误：

- 返回可 join 的 `runId`
- 前端仍以一次“开始跟踪”处理
- 不再额外弹“已在生成中”

### 手动刷新单个订阅源 / 全部订阅源

当前刷新链路只返回 `jobId`，前端依赖 `loadSnapshot()` 轮询并猜测完成时机，这不足以支撑“最终结果通知”。

建议新增用户触发级 refresh run 追踪：

- 新增 `feed_refresh_runs`
- 新增 `feed_refresh_run_items`

建议字段：

`feed_refresh_runs`

- `id`
- `scope`
  - `single`
  - `all`
- `status`
  - `queued`
  - `running`
  - `succeeded`
  - `failed`
- `requested_by`
  第一版可为空，预留
- `feed_id`
  单 feed 时使用
- `total_count`
- `succeeded_count`
- `failed_count`
- `error_message`
- `created_at`
- `updated_at`
- `finished_at`

`feed_refresh_run_items`

- `run_id`
- `feed_id`
- `status`
- `error_message`
- `updated_at`

接口建议：

- `POST /api/feeds/[id]/refresh`
  返回 `runId`
- `POST /api/feeds/refresh`
  返回 `runId`
- `GET /api/feed-refresh-runs/[runId]`
  返回聚合状态

前端规则：

- 请求被接受时先弹开始 `info`
- 后续只跟踪 `runId`
- `succeeded` 时弹：
  - `订阅源已刷新`
  - `全部订阅源已刷新`
- `failed` 时弹：
  - `刷新订阅源失败：<reason>`
  - `刷新全部订阅源失败：<reason>`

`refresh all` 的最终态规则：

- 所有目标 feed 都成功：`succeeded`
- 任一目标 feed 最终失败：`failed`
- 失败原因优先用聚合短句，例如：
  - `2 个订阅源刷新失败`

## `already_running` 与前置依赖处理

异步操作的 join 和等待前置条件需要统一语义。

### `already_running`

对用户操作来说，`already_running` 不是失败，而是“本次点击加入现有任务跟踪”。

规则：

- 后端返回现有的 `runId` / `sessionId`
- 前端注册本次 operation，并弹一次开始 `info`
- 最终仍然只等一次结果 toast

### `fulltext_pending`

这类状态不能立刻弹 `error`，否则会把“前置流程尚未完成”误报成失败。

推荐方案：

- 对用户显式触发的摘要/翻译操作，后端升级为复合异步流程
- 若全文未就绪，则自动进入：
  - 抓全文
  - 再继续当前摘要或翻译任务
- 前端第一次只看到“已开始”
- 最终只看到成功或失败

如果第一版无法在后端完成自动串联，则必须保证：

- `fulltext_pending` 不弹错误
- 当前点击至少能绑定到一个可继续观察的任务对象

否则该操作会落入“既未成功也未失败”的灰区，不符合本次目标。

## 前端模块设计

### 共享操作目录

建议新增：

- `src/lib/userOperationCatalog.ts`

内容包括：

- 各操作的 `actionKey`
- 同步/异步模式
- 开始/成功/失败文案模板
- 日志分类

### 前端 notifier

建议新增：

- `src/features/notifications/userOperationNotifier.ts`

职责：

- 管理 `operationId`
- 管理客户端内存 registry
- 统一生成 toast
- 对外提供：
  - `runImmediateOperation(...)`
  - `beginDeferredOperation(...)`
  - `resolveDeferredOperation(...)`
  - `failDeferredOperation(...)`

### 现有 toast 基础设施

继续复用：

- `src/features/toast/toast.ts`
- `src/features/toast/toastStore.ts`
- `src/features/toast/ToastHost.tsx`

但要求：

- tone 只保留 `success | info | error`
- 去重能力由 notifier 控制主逻辑，toast store 继续保留短时间窗口 dedupe 兜底

### 与 `apiClient` 的关系

被 notifier 接管的调用点必须显式传：

- `notifyOnError: false`

这样可以避免：

- 底层 transport 自动弹一次错误
- 上层操作 notifier 再弹一次错误

最终目标是：

- 用户直接触发操作 -> 统一走 notifier
- 被动读取请求 -> 不走全局 toast

## 首批纳入范围

### 同步操作

- 新增、编辑、删除订阅源
- 启用、停用订阅源
- 新增、编辑、删除 AI digest 源
- 分类重命名、删除、排序
- 移动订阅源到分类
- 保存设置
- OPML 导入
- OPML 导出
- 标记文章已读
- 标记全部已读
- 星标 / 取消星标
- 文章列表显示模式等会写后端的偏好变更

### 异步操作

- 刷新单个订阅源
- 刷新全部订阅源
- 生成 AI digest
- 生成 AI 摘要
- 发起 AI 翻译
- 重试 AI 翻译分段

### 明确排除

- 纯前端导出 markdown 等不打后端的操作
- 页面初始化加载
- 视图切换后的被动 snapshot 读取
- 无限滚动加载更多
- 后台轮询自身

## 迁移策略

迁移顺序建议如下：

1. 建立共享操作目录和前端 notifier
2. 建立服务端 `userOperationLogger`
3. 先迁移同步操作入口
4. 收口 `notifyApiError`
5. 为 AI digest 增加 run status 查询接口
6. 为手动 refresh 增加 refresh run 追踪与查询接口
7. 再迁移异步操作入口

这样做的原因：

- 同步操作最容易先统一，能快速消除手工 toast 散落
- 异步操作必须先补齐最终态观察能力，否则统一通知只是表面收口

## 受影响模块

前端重点：

- `src/features/feeds/useFeedDialogForm.ts`
- `src/features/feeds/useAiDigestDialogForm.ts`
- `src/features/feeds/FeedList.tsx`
- `src/features/articles/ArticleList.tsx`
- `src/features/articles/useStreamingAiSummary.ts`
- `src/features/articles/useImmersiveTranslation.ts`
- `src/store/appStore.ts`
- `src/features/settings/SettingsCenterDrawer.tsx`
- `src/features/settings/useSettingsAutosave.ts`

服务端重点：

- `src/server/logging/systemLogger.ts`
- `src/server/logging/userOperationLogger.ts`
- `src/app/api/feeds/[id]/refresh/route.ts`
- `src/app/api/feeds/refresh/route.ts`
- `src/app/api/ai-digests/[feedId]/generate/route.ts`
- 文章 AI 摘要和翻译相关 route / worker
- refresh 相关 worker 和仓库层

## 测试策略

### 单元测试

- 操作目录文案与模式映射
- notifier 状态机
- 成功不带原因、失败带短原因的格式化逻辑
- 同步一次、异步两次的生命周期约束

### 前端集成测试

- 点击同步操作只出现一次 toast
- 点击异步操作先出现开始 `info`，最终只出现一次结果 toast
- `notifyOnError: false` 后不再出现重复错误 toast

### 服务端测试

- 同步操作成功/失败能写入系统日志
- 异步开始和最终结果能写入系统日志
- `logging.enabled` 和 `logging.minLevel` 生效
- AI digest run status 与 refresh run status 接口返回稳定最终态

## 风险与取舍

### 风险 1：高频轻操作会显著增加 toast 数量

`markAsRead`、`toggleStar` 这类操作纳入后，通知会明显增多。

本次设计不做降噪，因为需求已明确要求严格纳入。后续若体验过于嘈杂，再评估是否把这类高频操作合并成批量通知，但不属于本次范围。

### 风险 2：异步最终态接口不补齐会导致规则落空

如果仍然沿用“轮询几次 snapshot 后猜测成功”，则无法可靠地给出最终成功或失败通知。

因此：

- AI digest 必须补 run status 查询
- 手动 refresh 必须补 refresh run 追踪

### 风险 3：日志与 toast 文案可能漂移

如果前后端各自拼文案，后续极易出现 toast 与日志不一致。

建议把操作目录和文案模板抽到共享模块，减少漂移面。

## 验收标准

- 任一用户直接触发且会打到后端的操作，都有统一 toast
- 同步操作只弹一次
- 异步操作最多弹两次：
  - 开始一次 `info`
  - 最终一次 `success` 或 `error`
- `success` 不显示原因
- `error` 显示简短原因
- `already_running`、`fulltext_pending` 不再被误报成 `error`
- 现有系统日志面板能搜索到这些用户操作日志
- 日志遵循 `logging.enabled` 和 `logging.minLevel`
- 刷新页面后不补发历史 toast
