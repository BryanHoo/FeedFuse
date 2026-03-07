# 简体中文正文跳过翻译设计

- 日期：2026-03-07
- 状态：已确认（Approved）
- 范围：
  - `src/server/db/migrations/0017_article_source_language.sql`
  - `src/server/repositories/articlesRepo.ts`
  - `src/server/rss/parseFeed.ts`
  - `src/server/services/readerSnapshotService.ts`
  - `src/app/api/articles/[id]/route.ts`
  - `src/app/api/articles/[id]/ai-translate/route.ts`
  - `src/worker/autoAiTriggers.ts`
  - `src/lib/apiClient.ts`
  - `src/types/index.ts`
  - `src/features/articles/useImmersiveTranslation.ts`
  - `src/features/articles/ArticleView.tsx`
  - `src/features/articles/ArticleView.aiTranslate.test.tsx`
  - `src/app/api/articles/routes.test.ts`
  - `src/worker/autoAiTriggers.test.ts`
  - `docs/plans/2026-03-07-simplified-chinese-translation-eligibility-implementation-plan.md`

## 1. 背景与目标

当前文章页的“翻译”按钮在 `src/features/articles/ArticleView.tsx` 中始终显示，且手动翻译、打开文章自动翻译、抓取后自动翻译三条路径都没有“正文本来就是简体中文”的统一收口逻辑。结果是：

1. 对已经是简体中文的文章，界面仍然鼓励用户触发正文翻译。
2. 即使前端未来隐藏按钮，只要后端 API 和 worker 不同步收口，仍可能继续创建无意义的翻译任务。
3. 现有“翻译”按钮语义已经被固定为“手动触发翻译任务”，而不是仅切换原文/译文视图，因此是否显示按钮本质上是“是否允许创建任务”的问题。

本次需求目标：

1. 当文章正文已经是**高置信度简体中文**时，不显示“翻译”按钮。
2. 同时阻止手动 API、打开文章自动翻译、抓取后自动翻译继续触发正文翻译。
3. 判定遵循“**持久化元数据优先，严格启发式兜底**”。
4. 只要结论不够确定，就默认允许翻译，避免误伤繁体中文、日文、双语稿件和短文本。

## 2. 已确认方向与边界

### 2.1 方案选型

采用方案 B：**服务端统一输出正文翻译资格（translation eligibility），优先使用显式语言元数据，缺失时再走严格启发式检测；前端只消费结论。**

原因：

1. 可以确保 UI、手动 API、on-open、on-fetch 四个入口行为一致。
2. 允许历史文章在没有语言字段时，仍然通过兜底规则获得正确行为。
3. 避免前端自己猜测语言，降低规则漂移风险。

### 2.2 已确认范围

1. 覆盖文章页“翻译”按钮显示逻辑。
2. 覆盖 `POST /api/articles/:id/ai-translate` 手动翻译入口。
3. 覆盖 `bodyTranslateOnOpenEnabled` 打开文章自动翻译。
4. 覆盖 `bodyTranslateOnFetchEnabled` 抓取后自动翻译。
5. 混合正文中允许出现英文术语、代码、链接、专有名词；只要主要可见正文是简体中文，仍按“无需翻译”处理。

### 2.3 不做内容

1. 不修改标题翻译逻辑；本次只处理正文翻译资格。
2. 不修改 AI 摘要逻辑。
3. 不引入 LLM 参与语言识别；语言判定保持本地、同步、可测试。
4. 不因为弱信号直接判定“无需翻译”；`zh` 这类模糊标签不会单独触发隐藏按钮。

## 3. 相关经验与已知约束来源

- 参考总结：[`docs/summaries/2026-03-05-ai-summary-translation-trigger-strategy-refactor.md`](../summaries/2026-03-05-ai-summary-translation-trigger-strategy-refactor.md)
  - 启发 1：文章页“翻译”按钮已经被定义为**手动重跑任务**，不能只改 UI 不改任务入口。
  - 启发 2：on-open 与手动入口必须共享同一套 `force` / reason 语义，不能产生分叉。
- 参考总结：[`docs/summaries/2026-03-04-immersive-translation.md`](../summaries/2026-03-04-immersive-translation.md)
  - 启发 1：翻译相关 API 已有稳定的 `reason` 语义，新增分支必须保持契约风格一致。
  - 启发 2：worker、snapshot、前端 hook 都已经围绕正文翻译任务建立链路，适合在服务端新增统一 eligibility 层，而不是散落修改。
- 参考总结：[`docs/summaries/2026-03-05-translation-preserve-html-structure.md`](../summaries/2026-03-05-translation-preserve-html-structure.md)
  - 启发：本次需求只改变“是否允许翻译”，不应碰已有翻译结果渲染结构与 `immersiveRender` 注入逻辑。
- 参考总结：[`docs/summaries/2026-03-04-async-tasks-refactor.md`](../summaries/2026-03-04-async-tasks-refactor.md)
  - 启发：拒绝翻译应作为正常业务分支返回，不应伪装成任务失败或错误态。

## 4. 方案比较与选型

### 方案 A：仅依赖持久化元数据

- 做法：只有当文章存在明确语言字段，且值可归一到简体中文时才隐藏按钮并阻止翻译。
- 优点：误判最低，语义清晰。
- 缺点：对历史文章和无语言元数据的内容覆盖不足。

### 方案 B（采纳）：元数据优先 + 服务端严格启发式兜底

- 做法：服务端统一判定 `bodyTranslationEligible`；优先看文章语言元数据，没有时再基于正文可见文本做严格检测。
- 优点：覆盖新旧文章，且 UI / API / worker 可共用同一结果。
- 缺点：需要补一组保守、可解释的启发式规则与回归测试。

### 方案 C：仅运行时启发式检测

- 做法：不加语言字段，前后端与 worker 各自运行一套启发式逻辑。
- 优点：短期改动最少。
- 缺点：最容易造成规则漂移；缺少未来接入显式语言元数据的扩展点。

结论：采用方案 B。

## 5. 架构与数据流设计

### 5.1 统一 eligibility 结论

新增一个服务端统一结论：

```ts
interface ArticleBodyTranslationEligibility {
  bodyTranslationEligible: boolean;
  bodyTranslationBlockedReason: 'source_is_simplified_chinese' | null;
  source: 'metadata' | 'heuristic';
}
```

结论只回答一件事：**当前文章是否允许继续触发正文翻译。**

### 5.2 元数据层

文章新增可选语言字段，例如 `source_language`，用于存储显式语言标签（若抓取链路能提供）。

设计约束：

1. 只把**显式标签**视为 metadata，不把运行时启发式结果落库为 metadata。
2. `zh-CN`、`zh-Hans`、`zh-SG`、`zh-MY` 等强简体标签可直接判定“无需翻译”。
3. `zh` 这类模糊标签不单独短路，仍需走启发式确认。
4. `zh-TW`、`zh-HK`、`zh-MO`、`zh-Hant` 明确视为非简体中文。

### 5.3 启发式兜底层

当 `source_language` 缺失或模糊时，服务端对正文可见文本做严格检测：

1. 取正文来源顺序与翻译源保持一致：优先 `contentFullHtml`，否则 `contentHtml`，最后才考虑摘要型备用文本。
2. 提取可见文本时忽略 HTML 标签、URL、脚本样式块，以及 `pre/code` 等代码区域噪声。
3. 统计中文正文长度、简体特征字、繁体特征字、日文假名等信号。
4. 只有在“文本量足够 + 简体特征明显 + 未出现强繁体/日文冲突”时，才判定为简体中文。
5. 任一条件不满足都默认放行翻译。

### 5.4 前端消费层

前端不自行做复杂语言检测，只消费服务端结论：

1. `reader snapshot` 中返回 `bodyTranslationEligible` 与 `bodyTranslationBlockedReason`，避免选中文章后出现错误的瞬时按钮状态。
2. 单篇文章 `GET /api/articles/:id` 返回同样字段，用于详情刷新与状态兜底。
3. `ArticleView` 仅在 `bodyTranslationEligible !== false` 时显示“翻译”按钮。
4. `useImmersiveTranslation` 对新的 blocked reason 做静默处理，不进入错误态。

### 5.5 手动与自动入口复用

以下入口都必须复用同一个 eligibility helper：

1. `POST /api/articles/:id/ai-translate`
2. `bodyTranslateOnOpenEnabled` 自动触发
3. `bodyTranslateOnFetchEnabled` 自动触发

这样可保证：

1. 按钮消失时，后端也不会继续入队。
2. 旧前端或并发状态下即使请求已发出，后端仍会稳定返回不入队结果。
3. 自动触发不会因为前端 UI 未更新而绕过判定。

## 6. 契约与数据模型调整

### 6.1 数据库 / repository

新增文章字段：

1. `articles.source_language text null`

`articlesRepo` 需要：

1. `insertArticleIgnoreDuplicate(...)` 支持写入 `sourceLanguage`。
2. `getArticleById(...)` / 文章查询结构补齐 `sourceLanguage`。

### 6.2 snapshot / article DTO

为 `ReaderSnapshotArticleItem` 与 `ArticleDto` 增加：

1. `bodyTranslationEligible: boolean`
2. `bodyTranslationBlockedReason: string | null`

其中：

1. snapshot 负责文章列表与文章页初始态。
2. 单篇文章 GET 负责详情刷新和状态收敛。

### 6.3 ai-translate POST reason

新增正常业务分支 reason：

1. `source_is_simplified_chinese`

行为：

1. 返回 `{ enqueued: false, reason: 'source_is_simplified_chinese' }`
2. 不创建任务，不写失败状态，不展示错误提示。

## 7. 错误处理与兼容性

1. “正文已是简体中文”不是异常，也不是失败任务，只是“无需执行”的正常分支。
2. 对已有 reason 语义不回归：
   - `missing_api_key`
   - `body_translate_disabled`
   - `already_translated`
   - `fulltext_pending`
   - `already_enqueued`
3. 新增 reason 后，前端 hook 要把它视为静默 no-op，避免出现“翻译失败”提示。
4. 旧文章若没有 `source_language`，仍然通过启发式得到一致结果，不需要一次性数据回填。

## 8. 测试设计

### 8.1 判定核心单测

覆盖以下样例：

1. `zh-CN` / `zh-Hans` 元数据 → `bodyTranslationEligible = false`
2. `zh-TW` / `zh-Hant` / `en` / `ja` → `bodyTranslationEligible = true`
3. 简中正文夹英文术语、链接、代码片段 → `bodyTranslationEligible = false`
4. 繁体正文、日文正文、超短正文 → `bodyTranslationEligible = true`

### 8.2 API 契约测试

`src/app/api/articles/routes.test.ts` 覆盖：

1. `POST /:id/ai-translate` 命中 `source_is_simplified_chinese` 时返回不入队。
2. `GET /:id` 返回新的 eligibility 字段。

### 8.3 worker 自动触发测试

`src/worker/autoAiTriggers.test.ts` 覆盖：

1. 当 `bodyTranslateOnFetchEnabled === true` 且文章正文已判定为简体中文时，不发送 `JOB_AI_TRANSLATE`。

### 8.4 前端回归测试

`src/features/articles/ArticleView.aiTranslate.test.tsx` 覆盖：

1. `bodyTranslationEligible = false` 时不渲染“翻译”按钮。
2. `bodyTranslateOnOpenEnabled = true` 但 `bodyTranslationEligible = false` 时，不触发 `enqueueArticleAiTranslate`。
3. 即使旧前端返回 `source_is_simplified_chinese`，hook 也不会进入错误态。

## 9. 最终设计结论

本次需求采用“**服务端统一 eligibility + 元数据优先 + 严格启发式兜底**”的方案，新增 `source_language` 作为扩展点，并把结论透出到 snapshot、单篇文章接口、手动翻译 API 与自动翻译入口。前端只依据 eligibility 决定是否显示按钮，后端与 worker 共享同一判定，确保“已是简体中文则不显示翻译按钮”不只是 UI 变化，而是完整的任务语义收口。
