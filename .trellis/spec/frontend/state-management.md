# State Management

> 状态管理采用「Zustand 全局状态 + 组件局部状态 + API/Worker 驱动的服务端状态」组合。

---

## State Categories

- 局部 UI 状态：`useState/useRef`（弹窗、当前 tab、临时 loading）。
- 全局会话状态：`src/store/appStore.ts`（feeds/articles/selectedView 等）。
- 全局设置状态：`src/store/settingsStore.ts`（持久化配置与草稿）。
- URL 状态：`appStore` 内同步 `view/article` 查询参数。
- 服务端状态：通过 API Route + `server/services` + `server/repositories` 读写 DB。

---

## When to Use Global State

满足任一条件即进入 store：
- 多个 feature 共享且需要同步更新（如 selectedView、selectedArticleId）。
- 需要跨路由/跨组件持久保留（如用户设置草稿）。
- 需要和 URL 或后台快照协同（如阅读快照分页 cursor）。

否则优先局部状态，避免全局状态膨胀。

---

## Server State

- 前端只通过 `lib/apiClient.ts` 与 `/api/*` 通信。
- Route 负责鉴权、参数校验、错误映射；业务逻辑下沉到 `src/server/services` 和 `src/server/repositories`。
- 后台异步任务（抓取、摘要、翻译）由 `src/worker/index.ts` + queue 驱动，前端通过轮询/SSE 感知结果。

跨层示例：
- `src/app/api/reader/snapshot/route.ts` -> `src/server/services/readerSnapshotService.ts`
- `src/app/api/feeds/route.ts` -> `src/server/services/feedCategoryLifecycleService.ts`
- `src/features/articles/useStreamingAiSummary.ts` -> `src/app/api/articles/[id]/ai-summary/stream/route.ts`

---

## Common Mistakes

- 把服务端业务规则塞进组件或 store（应留在 `server/services`）。
- 直接在多个组件重复调用同一 API，导致并发与一致性问题。
- 在 store 里保存仅单组件使用的短生命周期状态。
