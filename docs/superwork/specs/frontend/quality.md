# Frontend Quality

## 必跑校验

- `pnpm lint`
- `pnpm type-check`
- `pnpm test`

## 测试策略

- UI 组件至少有基础可渲染与关键交互测试（参考 `src/components/ui/ui-smoke.test.tsx`）。
- 高风险样式/主题变更需要契约测试覆盖（`*.contract.test.ts`）。
- Store 行为改动需更新对应 store 测试（如 `src/store/appStore.test.ts`）。

## 可访问性与交互基线

- 可交互控件必须可通过语义 role/label 定位（便于 RTL 与辅助技术）。
- Dialog/Sheet 等弹层组件必须提供可读标题与关闭路径。
- 键盘快捷键逻辑应过滤输入态元素，避免干扰输入框行为（参考 `ReaderLayout` 的可编辑目标判断）。

## 请求与错误处理基线

- 前端请求统一走 `requestApi`（`src/lib/apiClient.ts`），保持 envelope 解析与错误处理一致。
- 非特例场景不要在组件内直接 `fetch`，避免重复处理重试、超时、统一错误提示。
- 401 处理沿用 `apiClient` 内置重定向策略，避免各处自行分支。

## 视觉与主题回归点

- 修改 `globals.css` token 或 `designSystem` 常量时，检查浅色/深色主题是否都可读。
- 影响 Reader 三栏布局时，至少手测桌面、平板、移动三种宽度断点。

## 禁止捷径

- 禁止通过 `any` 绕过 UI 组件或 store 的类型约束。
- 禁止在多个 feature 重复复制同一段样式/状态逻辑而不抽取复用。
