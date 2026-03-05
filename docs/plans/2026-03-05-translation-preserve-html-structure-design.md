# 设计文档：沉浸式翻译保持原 HTML 结构与图片原位

日期：2026-03-05  
状态：已评审通过（待实现）  
范围：`ArticleView` / `useImmersiveTranslation` / immersive render helper / ai-translate 前端交互

## 1. 背景与问题

当前沉浸式翻译模式在 `ArticleView` 中采用“仅按 `segments` 渲染段落列表”的方式展示译文。该方式有一个直接副作用：

- 翻译模式下只会显示可翻译文本段；
- 原 HTML 中非段落节点（尤其 `<img>`）不会进入该列表；
- 用户切到翻译模式后出现“图片消失”。

用户目标已明确：

- 翻译模式中保持原 HTML 节点顺序与位置不变；
- 图片必须在原位置保留；
- 可翻译文本采用“原节点后追加译文节点”的形式展示（原文保留）。

## 2. 已知经验与约束

相关既有结论：

- `docs/summaries/2026-03-04-immersive-translation.md`
  - 已建立 `session + segments + SSE` 的逐段翻译模型；
  - 既有 reason 语义需保持兼容（`missing_api_key/fulltext_pending/body_translate_disabled/already_translated/already_enqueued`）。
- `docs/summaries/2026-03-04-async-tasks-refactor.md`
  - 前端应使用轻量状态更新路径，避免回退到大 payload 高频轮询；
  - 失败状态与重试交互应可持续复用。

当前实现约束：

- 后端按段持久化的数据主键语义是 `segmentIndex`；
- 前端与后端都默认可翻译集合：`p`、`h1-h6`、`li`、`blockquote`；
- SSE 事件存在乱序到达场景，前端必须保证稳定映射与展示顺序；
- 本次不调整 API/DB 契约。

## 3. 目标与非目标

### 3.1 目标

- 翻译模式下保留原 HTML 结构与节点位置（含图片、表格、代码块等）。
- 可翻译节点展示“原文 + 译文”：
  - 原文节点不删除；
  - 在原节点后注入译文节点。
- 继续复用现有 `enqueue/snapshot/SSE/retry` 数据流与状态机。
- 保持既有错误语义与交互路径不回归。

### 3.2 非目标

- 不改后端翻译任务模型、表结构与接口协议。
- 不在本次引入“整页翻译”或新的内容提取器。
- 不在本次做 SSE/队列架构升级。
- 不在本次引入复杂性能优化（先保证正确性）。

## 4. 方案比较与决策

### 方案 A（采纳）：前端在原 HTML 上按 `segmentIndex` 注入译文

- 做法：以 `article.content` 为基底，按与后端一致的规则找到可翻译节点，在目标节点后插入译文节点。
- 优点：
  - 改动集中在前端，改造面最小；
  - 非翻译节点天然保留原位（图片不丢）；
  - 不改 API/DB，风险可控。
- 风险：
  - 需要确保前端/后端节点筛选与文本归一化规则一致。

### 方案 B：后端生成并下发增量 merged HTML

- 优点：前端渲染逻辑更简单。
- 缺点：需要扩展接口负载与测试面；每次更新传输整段 HTML 成本更高。

### 方案 C：持久化 `domPath` 并按路径前端定位

- 优点：映射鲁棒性更高。
- 缺点：涉及 migration + repo + API + 前端联动，改造成本显著更高。

决策：采纳方案 A。优先在当前契约内修复“翻译后图片消失”与“结构位移”问题。

## 5. 架构设计

### 5.1 组件边界

- `useImmersiveTranslation`
  - 继续负责 `session/segments` 状态、请求触发、SSE 订阅、失败重试。
  - 不承担 HTML 结构渲染职责。
- `ArticleView`
  - 继续维护模式切换（原文/翻译）与任务状态提示。
  - 翻译模式从“段落列表渲染”切换为“原 HTML 增强渲染”。
- `immersiveRender`（新增 helper，建议路径：`src/features/articles/immersiveRender.ts`）
  - 输入：`baseHtml` + `segments`
  - 输出：注入译文后的 `enhancedHtml`
  - 职责：节点匹配、译文注入、容错处理。

### 5.2 渲染路径

- 原文模式：渲染 `article.content`。
- 翻译模式：
  - 若存在 immersive `segments`：渲染 `buildImmersiveHtml(article.content, segments)`；
  - 若仅有 legacy `aiTranslationBilingualHtml/aiTranslationZhHtml`：保留现有 fallback；
  - 否则保持原有 loading/错误提示。

## 6. 数据流与 DOM 映射规则

### 6.1 数据流

1. 用户点击“翻译”。
2. `enqueue -> snapshot -> SSE` 沿用现有链路。
3. `useImmersiveTranslation` 更新 `segments`。
4. `ArticleView` 根据最新 `segments` 重新计算 `enhancedHtml` 并渲染。

### 6.2 DOM 映射算法

1. 解析 `baseHtml` 为 DOM。
2. 使用 selector：`p,li,h1,h2,h3,h4,h5,h6,blockquote` 获取候选节点。
3. 对每个候选节点提取归一化可见文本（忽略 `code/pre`，空文本跳过）。
4. 形成 `nodeRefs[]`，其顺序 index 对齐 `segmentIndex`。
5. 逐段应用 patch：
   - `succeeded`：插入 `.ff-translation`（文本为 `translatedText`）。
   - `running/pending`：插入 `.ff-translation.ff-translation-pending`（文案“翻译中…”）。
   - `failed`：插入 `.ff-translation.ff-translation-failed`（错误提示 + 重试入口标记）。

### 6.3 映射失败容错

- `segmentIndex` 找不到目标节点：跳过该段并 `console.warn`；
- 任一段失败不阻塞整页渲染；
- 始终优先保证原文 HTML 可显示。

## 7. 交互与错误处理

### 7.1 单段重试

- 失败译文块输出 `data-segment-index` + `data-action="retry-segment"`。
- `ArticleView` 在内容容器上做事件委托，触发 `retrySegment(segmentIndex)`。

### 7.2 状态兼容

- 保持现有 reason 展示与按钮可用性逻辑：
  - `missing_api_key`
  - `fulltext_pending`
  - `body_translate_disabled`
  - `already_translated`
  - `already_enqueued`

### 7.3 安全约束

- 译文注入仅走文本节点（`textContent`），不把 `translatedText` 作为 HTML 注入；
- 防止模型输出中包含标签时扩大 XSS 风险。

## 8. 测试策略

### 8.1 `ArticleView` 行为测试

- 翻译模式保持图片原位：
  - 给定 `content` 含 `<p>A</p><img ...><p>B</p>`；
  - 收到翻译段更新后，断言 `img` 仍存在且顺序不变。
- 原文节点保留 + 译文后置：
  - 断言原文仍在，译文节点追加在目标段后。
- 失败段重试仍可用：
  - 点击失败块“重试该段”可触发 `retryArticleAiTranslateSegment(articleId, segmentIndex)`。

### 8.2 helper 纯函数测试（推荐）

- 覆盖 selector 对齐、空文本跳过、`code/pre` 排除、映射 miss 容错。
- 将 DOM 插入规则与 React 视图测试解耦，降低回归定位成本。

### 8.3 现有测试兼容

- `useImmersiveTranslation` 状态机与 SSE 顺序测试继续保留；
- 不减少现有已通过用例。

## 9. 验收标准（DoD）

1. 翻译模式下原 HTML 结构与节点顺序保持不变。
2. 图片在翻译模式下不消失，且位置与原文一致。
3. 可翻译节点展示“原文 + 译文”，且映射到正确段落。
4. SSE 乱序到达时仍能稳定显示到对应段落。
5. 失败段重试链路可用，成功后原位更新。
6. 不引入 API/DB 契约变更，不回归既有 reason 语义。

## 10. 风险与缓解

- 风险：前后端 selector 或文本归一化规则漂移导致错位。
  - 缓解：将 selector 常量与归一化逻辑抽为共享 helper，前后端复用同一实现或同一测试样例。
- 风险：长文重算 HTML 带来渲染抖动。
  - 缓解：先 `useMemo` 约束重算频率；后续若有证据再做增量 patch 优化。
