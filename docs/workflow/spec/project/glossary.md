# 领域词汇

## Feed

用户订阅的信息源。`kind` 目前至少包含 `rss` 和 `ai_digest`。普通 RSS feed 会抓取文章，`ai_digest` feed 表示由系统汇总生成的解读源。

## Article

阅读列表中的单篇内容，可能来自 RSS 抓取，也可能来自 `AI解读` 生成结果。文章会挂载阅读状态、全文、摘要、翻译、过滤结果等派生信息。

## Fulltext

对原始 RSS 条目做正文抓取和清洗后的全文内容。相关逻辑位于 `src/server/fulltext`，异步触发主要由 worker 负责。

## AI Summary

对文章全文生成的 AI 摘要。部分能力带有流式会话状态，前端展示和 worker 异步处理都需要关注其 session 数据。

## AI Translation

文章标题或正文翻译能力。正文翻译支持沉浸式分段翻译和双语 HTML 展示，相关处理横跨 API、worker 与前端阅读视图。

## AI Digest / AI解读

对多个订阅源做更高层级的归纳结果，既有独立的 feed 配置，也有独立的生成任务和文章展示逻辑。

## Persisted Settings

保存到后端的用户配置。进入系统前要先经过 `normalizePersistedSettings` 归一化，不能把原始 JSON 直接下发给 UI 或 worker。

## Session Settings

只存在于前端会话中的设置草稿或敏感状态，例如 API Key 输入框状态、RSS 校验状态。这部分通常由 `settingsStore` 管理，不直接落库。
