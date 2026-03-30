# 组件规范

## Client / Server 边界

- 需要浏览器 API、store、事件处理的组件必须显式加 `'use client'`
- 纯页面壳和重定向逻辑可保留在 App Router 服务端组件中
- 参考：
  `src/app/(reader)/page.tsx` 是服务端页面入口
  `src/app/(reader)/ReaderApp.tsx` 是客户端应用壳

## 组件职责

- 业务组合组件优先放 `src/features/*`
- 共享基础组件优先放 `src/components/ui/*`
- 不要把 feature 特有业务状态塞进 `components/ui`

## 样式约定

- 优先使用语义化 design token 和共享 class 组合
- 现有 contract test 明确约束：
  避免直接写原始色板类名如 `slate-*`、`gray-*`、`red-*`
- 主题、弹层、提示等视觉约束已经有 contract test 保护，改动这些区域时同步更新测试

## 复用约定

- 按钮、输入框、弹层、选择器等基础元素优先复用 `src/components/ui/*`
- 通用 class 拼接使用 `cn`
- 业务组件不要重复封装第二套 toast、dialog、toolbar primitive

## 组件实现建议

- 组件负责渲染和事件编排，网络请求和跨页面状态优先放 store / hook
- 复杂可复用交互优先拆出 feature 内 hook 或子组件
- 有明显行为语义的常量提到文件顶部，例如 `ArticleView.tsx` 的阈值和样式常量
