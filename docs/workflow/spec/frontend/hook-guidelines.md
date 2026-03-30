# Hook 规范

## 放置规则

- 应用级共享 hook 放 `src/hooks`
  例如 `useTheme`
- 只服务于某个 feature 的 hook，放在对应 `src/features/<domain>` 目录下
  例如文章沉浸式翻译、流式摘要等阅读相关 hook

## 实现规则

- hook 只暴露状态、衍生值和操作函数，不返回 JSX
- 订阅浏览器事件时必须在 effect cleanup 中移除监听
- 参考 `src/hooks/useTheme.ts`
  在 effect 中同步 DOM class，并处理 `matchMedia` 监听的清理

## 与 store 的关系

- 读取全局共享状态时优先从 Zustand selector 取最小片段
- 只有局部交互状态才留在组件内 `useState`
- 不要在多个 hook 中各自维护一份相同的远端状态缓存

## 何时不要写新 hook

- 只是一个组件内部、一次性的小逻辑：
  直接留在组件内即可
- 已经存在 store action 或 feature 工具函数能表达同一能力：
  先复用，不要重复包一层“转发 hook”
