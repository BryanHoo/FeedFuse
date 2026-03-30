# 跨层改动检查表

FeedFuse 的很多功能不是单点文件改动，而是会同时穿过页面、store、API、服务端领域层和 worker。开始编码前按下面的顺序过一遍。

## 1. 先明确改动落在哪条链路

- 纯前端展示：
  通常只涉及 `src/features`、`src/components/ui`、`src/store`
- 同步 API 操作：
  通常涉及 `src/lib/apiClient.ts` -> `src/app/api/**/route.ts` -> `src/server/repositories/*` 或 `src/server/services/*`
- 异步任务：
  除了同步 API 外，还会继续进入 `src/server/queue/*`、`src/worker/*`

## 2. 数据形状是否需要跨层对齐

遇到以下情况时，不要只改一层：

- API 请求体或响应体变化
- `PersistedSettings` 结构变化
- 数据库字段新增或语义变化
- 文章详情、任务状态、AI 会话结构变化

常见同步点：

- `src/types`
- `src/lib/apiClient.ts`
- 对应 `route.ts`
- 对应 repository / service
- 相关 store 和 feature 组件

## 3. 先看是否已有异步基础设施

如果需求包含“后台抓取”“重试”“状态轮询”“延迟执行”，优先复用：

- `src/server/queue/contracts.ts`
- `src/server/queue/jobs.ts`
- `src/server/queue/bootstrap.ts`
- `src/worker/index.ts`
- `src/worker/*Worker.ts`

不要在 API route 里直接做长耗时任务，除非确认该任务必须同步完成。

## 4. 配置改动要检查的额外点

设置类改动通常至少涉及：

- `src/features/settings/settingsSchema.ts`
- `src/store/settingsStore.ts`
- `src/app/api/settings/route.ts`
- 对应 repository
- 如影响 AI/缓存行为，再检查 `cleanupAiRuntimeState` 和 worker 消费逻辑

## 5. 验证要贴合变更半径

- 改样式：补跑 contract test
- 改 API：补跑 route test
- 改数据库：补跑 migration test
- 改 runtime 兼容：补跑 `*.runtime.test.ts`

如果改动横跨两层以上，不要只跑单个文件测试后就结束。
