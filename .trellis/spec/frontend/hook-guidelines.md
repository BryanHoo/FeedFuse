# Hook Guidelines

> Hook 主要承载可复用状态机、异步流程与副作用生命周期管理。

---

## Custom Hook Patterns

- 名称必须以 `use` 开头，并按业务域就近放置。
- Hook 输入输出尽量结构化（`input` + `result`），避免位置参数过多。
- 包含定时器、`EventSource`、DOM 监听时必须清理副作用。

示例：
- `useStreamingAiSummary`：SSE 流式状态机，含超时与清理
- `useSettingsAutosave`：延迟保存 + 状态派生
- `useTheme`：主题同步与 `matchMedia` 监听

---

## Data Fetching

- 本项目不使用 React Query/SWR；统一走 `src/lib/apiClient.ts`。
- 复杂请求流程通常由 store action 或 feature hook 封装。
- API 返回统一 envelope（`{ ok: true|false }`），客户端通过 `requestApi` 统一解包与报错。

示例：
- `getReaderSnapshot` / `createFeed` in `src/lib/apiClient.ts`
- `loadSnapshot` in `src/store/appStore.ts`
- `requestSummary` in `src/features/articles/useStreamingAiSummary.ts`

---

## Naming Conventions

- 通用 hook 放 `src/hooks`：`useTheme`, `useRenderTimeSnapshot`。
- 业务 hook 放 `src/features/<domain>`：`useFeedDialogForm`, `useImmersiveTranslation`。
- Hook 文件名与导出函数同名，避免 default export。

---

## Common Mistakes

- 忘记在 `useEffect` 返回清理函数，导致监听或定时器泄漏。
- Hook 内同时处理过多职责（请求、UI、通知全部耦合）。
- 依赖项数组遗漏，导致状态不同步。
