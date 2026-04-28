# Quality Guidelines

> 质量标准覆盖全栈链路：前端组件、API Route、服务层、仓储层、Worker。

---

## Forbidden Patterns

- Route 中直接写 SQL 或复杂业务编排（应下沉到 `server/repositories`/`server/services`）。
- 跳过统一响应封装，直接返回不一致 JSON 结构（应使用 `ok`/`fail`）。
- 未清理副作用（`setInterval`、`EventSource`、DOM 监听）。
- 绕过参数校验直接信任用户输入。

---

## Required Patterns

- 前端请求统一走 `src/lib/apiClient.ts`，集中处理超时、401、错误通知。
- API Route 先 `requireApiSession`，再做 Zod 校验，再调用 service/repo。
- 服务端错误统一转为 `AppError` 子类并通过 `fail` 返回。
- 样式合并统一用 `cn`，UI 变体用 `cva`。

示例：
- `src/server/http/apiResponse.ts`
- `src/app/api/feeds/route.ts`
- `src/components/ui/button.tsx`

---

## Testing Requirements

- 使用 Vitest，区分 `node` 与 `jsdom` 两个 project（见 `vitest.config.ts`）。
- Route、service、repo、worker 的行为变更必须补同层测试。
- UI 交互、可访问性和契约（contract）改动必须补 `*.test.tsx` 或 `*.contract.test.ts`。

示例：
- `src/app/api/feeds/routes.test.ts`
- `src/server/services/readerSnapshotService.test.ts`
- `src/components/ui/popup-surface.contract.test.ts`
- `src/worker/rssScheduler.test.ts`

---

## Code Review Checklist

- 是否保持 `app/api -> server/services|repositories -> db` 分层清晰。
- 是否新增或破坏了 DTO/领域模型映射一致性。
- 是否为新增逻辑补了对应层级测试。
- 是否引入副作用泄漏、未处理异常或未鉴权入口。
