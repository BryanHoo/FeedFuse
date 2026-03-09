# 页面重新可见时同步订阅源快照设计

- 日期：2026-03-09
- 状态：已确认
- 需求：页面从后台切回前台时，静默刷新当前阅读器视图，显示后端当前最新的订阅源数据，例如未读文章与未读数更新

## 背景

当前阅读器通过 [`src/app/(reader)/ReaderApp.tsx`](../../src/app/(reader)/ReaderApp.tsx) 在首屏加载和 `selectedView` 变更时调用 [`src/store/appStore.ts`](../../src/store/appStore.ts) 中的 `loadSnapshot`，再由 store 统一更新 `categories`、`feeds` 和 `articles`。手动刷新按钮位于 [`src/features/articles/ArticleList.tsx`](../../src/features/articles/ArticleList.tsx)，其行为是触发 `refreshFeed` 或 `refreshAllFeeds`，随后轮询 snapshot。

这说明项目当前已具备两条清晰的数据路径：

- `loadSnapshot`：仅从后端读取当前快照并同步前端状态
- 手动刷新按钮：触发订阅源抓取任务，再轮询最新快照

本需求明确要求采用第一条路径，不在页面重新聚焦时触发新的订阅源抓取任务。

截至 2026-03-09，仓库中没有 `docs/summaries/` 目录可供复用历史经验，因此本设计仅基于现有 reader 架构、store 行为和最近提交状态制定。

## 目标

- 在浏览器标签页从后台切回前台时，静默同步当前视图对应的 reader snapshot。
- 让未读数、文章列表和其他已存在于 snapshot 中的数据及时反映后端当前状态。
- 复用现有 `loadSnapshot` 数据链路，不新增后端接口与新型刷新协议。
- 将自动同步限制为每 5 分钟最多执行一次，避免频繁切换标签页时产生重复请求。

## 非目标

- 不触发 `refreshFeed` 或 `refreshAllFeeds`，不主动发起新的订阅抓取任务。
- 不增加 toast、横幅、刷新成功提示或新的全局 loading 提示。
- 不引入自动轮询、后台定时器或持续保活逻辑。
- 不修改文章详情加载、手动刷新按钮语义或现有 snapshot 结构。

## 备选方案

### 方案 1：在 `ReaderApp` 监听 `document.visibilitychange`

在 [`src/app/(reader)/ReaderApp.tsx`](../../src/app/(reader)/ReaderApp.tsx) 中监听 `document.visibilitychange`。当页面状态变为 `visible` 时，读取当前 `selectedView` 并调用 `loadSnapshot`。通过本地时间戳限制自动同步频率为每 5 分钟最多一次。

优点：

- 接入点集中在 reader 生命周期入口，和现有首屏加载逻辑一致。
- 直接复用 `loadSnapshot`，不需要扩展新的状态管理层。
- 改动范围小，测试边界清晰。

缺点：

- 需要在组件中额外维护自动同步冷却时间。
- 如果未来别的页面也需要同样策略，可能再抽象成 hook。

### 方案 2：抽离 `useRefreshSnapshotOnPageVisible` hook

将 `visibilitychange` 监听、冷却时间和视图读取封装为独立 hook，再由 `ReaderApp` 使用。

优点：

- 关注点更独立，未来更容易复用。
- 测试隔离更细，逻辑更聚合。

缺点：

- 对当前单一 reader 使用场景来说抽象偏早。
- 会引入额外文件和概念层，收益有限。

### 方案 3：把自动同步策略下沉到 store

在 [`src/store/appStore.ts`](../../src/store/appStore.ts) 中新增与自动可见性同步相关的状态和 action，例如上次自动刷新时间、自动刷新入口和并发保护。

优点：

- 后续若要统一管理刷新来源、节流策略和埋点，扩展空间最大。

缺点：

- 让 store 同时承担 DOM 生命周期触发语义，复杂度偏高。
- 当前需求只需要页面可见性事件，放到 store 明显过重。

## 推荐方案

采用方案 1：在 `ReaderApp` 监听 `document.visibilitychange`，当标签页重新变为前台时静默调用 `loadSnapshot`，并加入 5 分钟自动同步间隔控制。

理由：

- 符合当前 reader 的数据入口结构。
- 不会误用手动刷新那条“触发抓取任务”的路径。
- 能以最小改动实现“返回页面即同步后端最新状态”的目标。

## 已确认设计

### 架构与组件边界

本次改动落在 [`src/app/(reader)/ReaderApp.tsx`](../../src/app/(reader)/ReaderApp.tsx)，而不是 [`src/features/articles/ArticleList.tsx`](../../src/features/articles/ArticleList.tsx)。

原因如下：

- `ReaderApp` 已经负责初次 `loadSnapshot`，是 reader 数据初始化入口。
- 自动同步不仅影响文章列表，还影响 feed 未读数、分类聚合和其他依赖 snapshot 的界面状态。
- 监听页面可见性属于应用级生命周期，更适合放在 reader 根组件。

不建议把这次逻辑接到手动刷新按钮所在组件，否则会混淆“同步现有后端数据”和“触发新的订阅抓取”这两种语义。

### 数据流与触发规则

自动同步链路定义如下：

1. 用户离开当前标签页，页面进入后台。
2. 用户切回该标签页，触发 `document.visibilitychange`。
3. 当 `document.visibilityState === 'visible'` 时，读取当前 store 中最新的 `selectedView`。
4. 如果距离上次自动同步已满 5 分钟，则调用 `loadSnapshot({ view: selectedView })`。
5. `loadSnapshot` 继续沿用当前逻辑更新 `categories`、`feeds`、`articles`。
6. 如果当前仍有选中的文章且正文尚未完整加载，继续复用 store 现有的补全文逻辑。

这里有两个关键约束：

- 只监听标签页重新可见，不监听 `window.focus`
- 5 分钟间隔只作用于“自动可见性同步”，不影响首屏加载、切换视图和手动刷新

### 冷却与去重策略

自动同步需要增加轻量去重，但不需要另造复杂并发系统。

建议行为如下：

- 在 `ReaderApp` 内记录“上次自动同步完成发起”的时间戳。
- 初次挂载时仍按现有逻辑立即加载 snapshot，不受 5 分钟限制。
- 只有当标签页从后台切回前台，且当前时间与上次自动同步时间差大于等于 5 分钟时，才允许再次调用 `loadSnapshot`。
- 如果 5 分钟内多次切换标签页，直接跳过，不重复发起 snapshot 请求。

现有 `loadSnapshot` 中的 `snapshotRequestId` 已经能避免旧请求覆盖新请求，因此本次只需要补充“是否要发起新请求”的前置判断，不需要重写 store 并发模型。

### 体验与异常处理

自动同步采用完全静默的交互策略：

- 不显示刷新成功提示
- 不复用手动刷新按钮的旋转状态
- 不新增全局 loading 文案

如果自动同步失败：

- 继续沿用 `loadSnapshot` 的静默失败策略
- 保持当前界面数据不变
- 不额外弹出错误通知

这样可以保证“切回页面时尽量同步最新数据”，但不会打断阅读流程或制造噪声。

### 测试要求

测试应优先覆盖 [`src/app/(reader)/ReaderApp.test.tsx`](../../src/app/(reader)/ReaderApp.test.tsx)，因为自动同步能力挂在 `ReaderApp` 生命周期上。

最低验证范围如下：

- 初次挂载时依旧会加载一次 snapshot。
- 当标签页从后台切回前台时，会触发一次静默 `loadSnapshot`。
- 在 5 分钟冷却时间内连续触发 `visibilitychange`，不会重复拉取 snapshot。
- 超过 5 分钟后再次切回前台，会重新拉取 snapshot。
- 自动同步不会触发 `refreshFeed` 或 `refreshAllFeeds` 相关请求。

如测试环境需要控制时间，应优先使用 Vitest 的 fake timers，而不是引入新的时间工具依赖。

## 实施边界

本次仅规划以下行为：

- 标签页重新变为前台时的 snapshot 静默同步
- 自动同步 5 分钟冷却
- `ReaderApp` 级别测试覆盖

以下能力明确不纳入本次需求：

- 订阅抓取任务自动触发
- 定时轮询 snapshot
- 前台提示条、刷新状态提示或用户可配置的自动刷新频率

## 参考实现入口

- [`src/app/(reader)/ReaderApp.tsx`](../../src/app/(reader)/ReaderApp.tsx)
- [`src/app/(reader)/ReaderApp.test.tsx`](../../src/app/(reader)/ReaderApp.test.tsx)
- [`src/store/appStore.ts`](../../src/store/appStore.ts)
- [`src/features/articles/ArticleList.tsx`](../../src/features/articles/ArticleList.tsx)
