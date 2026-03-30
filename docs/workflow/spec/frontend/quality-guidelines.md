# 前端质量与验证

## 现有测试信号

- 样式和主题 token：`src/app/theme-token-usage.contract.test.ts`
- 全局样式契约：`src/app/globals-css.contract.test.ts`
- 弹层表面一致性：`src/components/ui/popup-surface.contract.test.ts`
- 文章可读性契约：`src/features/articles/ArticleView.readability.contract.test.ts`
- 其余功能测试：按 `*.test.ts` / `*.test.tsx` 分布在相关目录

## 改动后的验证建议

- 改基础 UI 或主题 token：
  至少跑相关 contract test
- 改阅读页主流程：
  跑 `ArticleView`、reader、store 相关测试
- 改 settings：
  跑 `settingsStore` 和对应 API route 测试
- 改页面元信息或全局布局：
  跑 `layout.metadata.test.ts`、`globals-css.contract.test.ts`

## 视觉和可访问性约束

- 保留 `src/app/layout.tsx` 中的跳转到主要内容入口，不要破坏键盘可达性
- 主题和颜色优先使用语义 token，不回退到硬编码原始色板
- 修改弹层、toast、dialog、sheet、tooltip 等共享组件时，同步检查 contract test 是否仍然表达真实设计约束

## 常见回归点

- 只改组件样式，没有同步更新 contract test
- 在组件里直接调 API，绕过 `apiClient` 和 store 造成状态不一致
- 改了 settings shape，但没有同步 `settingsStore` 草稿和归一化流程
- 轮询型 AI 操作把 `skipped_no_updates` 误当作普通成功，导致“没有相关内容”仍提示“已生成”；智能报告这类流程需要把终态文案和运行状态一起校准
