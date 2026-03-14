# AI 聚合解读定时输出设计

- 日期：2026-03-14
- 状态：已确认
- 需求：在 FeedFuse 中新增“AI解读源”（AI 聚合分析定时输出）。用户在左栏现有“添加订阅源”入口处新增“添加 AI解读”，配置后在分类树生成一个新的“订阅源条目”（名称=用户标题），按重复时间间隔对所选订阅源/分类在窗口内的更新条目进行 AI 解读，生成一篇新的解读文章（列表累积）；点击该源时，中栏显示解读文章列表，右栏显示解读正文。

## 背景

当前 FeedFuse 的阅读器核心数据模型是：

- `categories` 表存分类（仅用于左栏分组，不是可选 view）
- `feeds` 表存订阅源（当前全是 RSS feed）
- `articles` 表存条目，包含 `fetched_at`（默认 `now()`），并按 `(feed_id, dedupe_key)` 去重
- 阅读器三栏通过 `src/server/services/readerSnapshotService.ts` 生成 snapshot：
  - `selectedView` 只有 `all/unread/starred` 或具体 `feedId`
  - `buildArticleFilter()` 当前仅按 `articles` 过滤，不 join `feeds`
- 后台任务使用 `pg-boss`：
  - 已有 `boss.schedule(JOB_REFRESH_ALL, '* * * * *')` 每分钟刷新
  - 队列 contract 位于 `src/server/queue/contracts.ts`
- 已有 AI 能力与存储：
  - `getAiApiKey()` / `normalizePersistedSettings()` 提供 AI 配置（`ai.model`、`ai.apiBaseUrl`）
  - 文章 AI 摘要使用 worker 生成并写入 `articles.ai_summary`
  - HTML sanitize 复用 `src/server/rss/sanitizeContent.ts`（`sanitize-html`）

本功能设计要兼容并复用上述结构，同时满足以下产品约束（已确认）：

- `AI解读源` 在左栏表现为“订阅源条目”，与 RSS 源同级（不是分类节点）
- 每次触发生成 **一篇新的** 解读文章（累积成列表），不是覆盖同一篇
- 时间窗口按 `articles.fetched_at` 判定（不是 `published_at`）
- 首次窗口从创建时刻开始（不回看创建前历史）
- 窗口内无新文章则 **不生成文章**
- 重复时间为“间隔语义”，频率使用固定选项（非自定义输入）
- 可多选订阅源与分类；选择分类时，运行时动态解析该分类下 RSS 订阅源范围，且明确 **不包括 `AI解读源`**
- 解读文章 **不应出现在** `全部文章/未读文章/收藏文章` 智能视图里（只在该 `AI解读源` 下可见）
- 在该 `AI解读源` view 下，把“刷新订阅源”按钮替换为“立即生成”
- 解读文章标题由 AI 生成：在用户提示词后注入“生成标题”的内部提示词，正文生成后同时生成标题；失败兜底用 `AI解读源` 的标题
- 内容输入策略（选 B）：优先 `content_full_html`，否则 `title + summary`；不会为了 AI 解读额外强制抓全文
- 相关性策略（选 3）：先筛选再解读，`Top N = 10`，且同一 feed 入选不做限制

## 目标

- 在左栏 `+` 菜单新增 `添加 AI解读`，提供单页表单配置并创建一个 `AI解读源`
- `AI解读源` 在分类树中作为订阅源条目展示，名称等同用户输入标题
- 按固定“间隔”定时触发生成：
  - 在窗口内有更新时，生成一篇新的解读文章并显示在该源下
  - 在窗口内无更新时，不生成文章，但要推进窗口游标（避免重复扫描同一窗口）
- 支持手动“立即生成”，语义与自动生成一致
- 保证 `全部/未读/收藏` 智能视图只包含 RSS articles，不包含解读文章

## 非目标

- 不做 embeddings / 向量检索 / RAG 索引
- 不做“固定时刻”（例如每天 9 点）调度，仅支持间隔
- 不做多样性约束（例如“同一 feed 最多入选 2 篇”），本版明确不限制
- 不做流式生成 UI（生成完成后作为一篇文章落库即可）
- 不强制抓全文（不会为了解读触发 `article.fetch_fulltext`）

## 备选方案

### 方案 A：独立的 digest 实体体系（不复用 `feeds/articles`）

优点：

- 概念更隔离，不会影响 RSS 抓取逻辑

缺点：

- 需要新做一套列表/详情/分页/未读/收藏/状态同步，成本过高
- 复用现有三栏阅读器难度大

### 方案 B：把 `AI解读源` 当作一种 `feed`（推荐）

做法：

- 在 `feeds` 增加 `kind` 区分 `rss` 与 `ai_digest`
- 解读文章仍写入 `articles`，只是在智能视图里排除 `ai_digest`

优点：

- 最大化复用现有阅读器三栏与 `articles` 展示链路
- 落地最短，边界清晰：`rss` 走抓取；`ai_digest` 走生成

风险：

- 需要在抓取调度、刷新、智能视图查询、全局操作（如 mark-all-read）里显式排除 `ai_digest`

### 方案 C：把解读作为分类节点（不推荐）

不符合已确认约束：分类当前仅用于分组且不可选 view；同时用户要求“表现为订阅源条目”。

## 推荐方案

采用方案 B：`AI解读源` 作为 `feeds.kind='ai_digest'` 的一种 feed 类型存在，解读结果作为该 feed 下的文章条目写入 `articles`。

## 已确认设计

### 1) 术语与核心概念

- RSS feed：`feeds.kind = 'rss'`
- AI解读源：`feeds.kind = 'ai_digest'`
- 解读配置：每个 AI解读源对应一条配置记录（选源、间隔、提示词、Top N、窗口游标）
- 解读运行（run）：一次生成尝试（含窗口边界、候选数量、状态、错误等）

### 2) UI 与交互

#### 左栏入口

- 现有 `+` 按钮改为弹出菜单：
  - `添加 RSS 源`
  - `添加 AI解读`

#### 添加 AI解读弹窗（单页表单）

- `标题`：必填，作为 `feeds.title`
- `AI解读`：提示词 textarea（必填）
- `来源`：可多选
  - RSS feeds 多选
  - 分类多选（运行时解析为其下 RSS feeds）
- `重复时间`：固定选项（存储为 `interval_minutes`）
- `分类`：选择一个分类（若不存在则创建；存在则放现有分类下）
- 说明文案：强调“只会解读窗口内更新，且最终只纳入 Top 10 篇”
- 创建成功后行为：
  - 仅刷新 snapshot（`loadSnapshot`）
  - 不触发 `refreshFeed` 或 RSS 抓取（避免复用 RSS 新增订阅时的自动抓取语义）

#### 阅读器三栏表现

- 点击 `AI解读源`：
  - 中栏显示该解读源下生成的解读文章列表（即 `articles.feed_id = ai_digest_feed_id`）
  - 右栏显示解读正文（HTML，需 sanitize）
- 工具栏按钮替换：
  - 当 selected feed 为 `ai_digest`：显示 `立即生成`
  - 当 selected feed 为 `rss`：保持原 `刷新订阅源`

#### 智能视图隔离（必做）

- `all/unread/starred` 的文章列表必须排除 `feeds.kind='ai_digest'`
- `AI解读源` 生成的文章不在智能视图出现，但在其自身 feed view 下正常显示

### 3) 数据模型

#### 3.1 `feeds` 增量字段

为复用现有 `feeds`/`articles` 结构，新增字段：

- `feeds.kind text not null default 'rss'`
  - 允许值：`'rss' | 'ai_digest'`
  - 既有数据迁移为 `'rss'`

#### 3.2 `ai_digest_configs`（每个 AI解读源一条）

建议表结构（字段名可按现有迁移命名风格微调）：

- `feed_id uuid primary key references feeds(id) on delete cascade`
- `prompt text not null`
- `interval_minutes int not null`
- `top_n int not null default 10`
- `selected_feed_ids uuid[] not null default '{}'`
- `selected_category_ids uuid[] not null default '{}'`
- `last_window_end_at timestamptz not null`
  - 创建时初始化为 `now()`
  - 用于保证“首次窗口不回看历史”
- `created_at/updated_at`

#### 3.3 `ai_digest_runs`（用于幂等与观测，推荐纳入 MVP）

- `id uuid primary key default gen_random_uuid()`
- `feed_id uuid not null references feeds(id) on delete cascade`
- `window_start_at timestamptz not null`
- `window_end_at timestamptz not null`
- `status text not null`
  - `queued | running | succeeded | failed | skipped_no_updates`
- `candidate_total int not null default 0`
- `selected_count int not null default 0`
- `article_id uuid null references articles(id)`
- `model text null`
- `error_code text null`
- `error_message text null`
- `job_id text null`
- `created_at/updated_at`

说明：

- 通过 `runId` 作为幂等粒度，保证 job 重试不会生成多篇重复解读文章
- run 表也为后续“显示上次生成状态/错误”提供基础
- 为避免 tick 或手动触发重复创建同一窗口的 run，建议增加唯一约束：
  - `unique(feed_id, window_start_at)`

#### 3.4 必要索引

本功能按 `fetched_at` 做窗口查询，建议新增索引（否则容易全表扫）：

- `articles(feed_id, fetched_at desc, id desc)`

### 4) API 设计

新增专用 API（避免强行复用 `POST /api/feeds` 的 RSS 语义与校验）：

- `POST /api/ai-digests`
  - 创建 `feeds.kind='ai_digest'` + `ai_digest_configs`
  - 入参：
    - `title`
    - `categoryId | categoryName`（互斥，复用现有分类解析规则）
    - `intervalMinutes`（固定选项之一）
    - `prompt`
    - `selectedFeedIds[]`
    - `selectedCategoryIds[]`
  - 行为：
    - 生成一个合成 URL（见下节）以满足 `feeds.url not null` 约束
    - `last_window_end_at` 初始化为 `now()`

- `POST /api/ai-digests/:feedId/generate`
  - 手动触发“立即生成”
  - 行为（find-or-create）：
    - 校验 `AI API key` 已配置；缺失则按下文错误策略返回
    - 计算本次窗口：`window_start_at = last_window_end_at`、`window_end_at = now()`
    - 若已存在 `ai_digest_runs(feed_id, window_start_at)`：
      - `status in ('queued','running')`：返回 `already_running`
      - `status = 'failed'`：允许重新 enqueue 同一个 `runId`（手动重试）
    - 否则创建 run 并 enqueue

- `GET /api/ai-digests/:feedId`
  - 用于编辑弹窗回填（可后续做）

- `PATCH /api/ai-digests/:feedId`
  - 更新 `prompt/interval/sources/category/title`（可后续做）

错误与校验：

- 若未配置 `AI API key`（`getAiApiKey()` 为空）：
  - `POST /api/ai-digests/:feedId/generate` 返回结构化原因（例如 `missing_api_key`），且不创建 run、不入队
  - `ai.digest_tick` 也不创建 run、不入队（避免后台无意义重试与堆积）

### 5) 合成 URL 规则（兼容现有约束）

现有表结构与 API 约束：

- `feeds.url` 为 `not null` 且有唯一索引 `feeds_url_unique`
- 现有 `POST /api/feeds` 校验 `url()` 且通过 SSRF guard（只允许 `http/https`）

因此 `ai_digest` feed 使用合成 URL，例如：

- `http://localhost/__feedfuse_ai_digest__/<feedId>`

约束：

- 仅作为占位，不会被 RSS 抓取逻辑使用
- RSS 抓取相关逻辑必须改为只处理 `feeds.kind='rss'`

### 6) Worker 与队列

#### 6.1 新增 job

- `ai.digest_tick`
  - 每分钟触发一次，用于扫描 due 的解读配置并派发生成 job
- `ai.digest_generate`
  - 执行一次 run：筛选候选、生成解读文章、写库、推进窗口游标

队列 contract 建议：

- `ai.digest_tick`：`localConcurrency: 1`
- `ai.digest_generate`：`localConcurrency: 1 or 2`（避免过多并发占用 LLM quota）
  - queue options：建议开启有限重试与退避（例如 `retryLimit: 3` + `retryBackoff: true`），降低瞬时网络/供应商错误导致的空窗
  - send options：按 `runId` 做 `singletonKey`，保证同一 run 不会被并发重复执行

#### 6.2 调度方式（间隔语义）

- 使用 `boss.schedule('ai.digest_tick', '* * * * *')` 每分钟 tick
- tick 逻辑：
  - 若未配置 `AI API key`，直接跳过（不创建 run、不入队）
  - 找出 `now - last_window_end_at >= interval_minutes` 的 configs
  - 对每条 due config：
    - `window_start_at = last_window_end_at`
    - `window_end_at = now()`（写入 run 后固定，不随 tick 再变化）
    - 若已存在 `ai_digest_runs` 满足：
      - `feed_id = <ai_digest_feed_id>` 且 `window_start_at = <window_start_at>`
      - `status in ('queued','running','failed')`
      则跳过（避免重复创建同一窗口的 run；重试由队列 retry 负责）
    - 否则创建 `ai_digest_runs`（`status='queued'`，固定 `window_start_at` 与 `window_end_at`）
    - enqueue `ai.digest_generate`（data: `{ runId }`）

#### 6.3 生成逻辑（`ai.digest_generate`）

输入：`runId`

步骤：

1. 读取 run、config、对应的 `ai_digest` feed
2. 解析本次目标 RSS feeds（运行时动态）：
   - `selected_feed_ids`：过滤出 `feeds.kind='rss'`
   - `selected_category_ids`：查询分类下当前所有 `feeds.kind='rss'`
   - 合并去重为 `targetFeedIds`
3. 候选文章查询：
   - `articles.feed_id in targetFeedIds`
   - `articles.fetched_at in (window_start_at, window_end_at]`
4. 若候选为 0：
   - run: `skipped_no_updates`
   - 推进 `ai_digest_configs.last_window_end_at = window_end_at`
   - 结束（符合“无更新不生成文章”，但避免重复扫同一窗口）
5. 相关性筛选（Top 10，按用户提示词）：
   - 只用轻量字段进行 rerank：`feedTitle + title + summary + link + fetched_at`
   - 使用“增量 shortlist rerank”以避免上下文爆炸：
     - 初始化 `shortlist = []`
     - 将候选按批（例如 40-60 条）处理
     - 每批调用一次 LLM：输入为 `shortlist + batch`，输出新的 `shortlist`（长度固定为 10 或不足 10）
     - 迭代完成后得到最终 Top 10 的 `articleId[]`
   - 若筛选阶段失败：降级为按 `fetched_at desc` 取最新 10 篇
6. 解读生成（map-reduce + 递归折叠）：
   - 对选出的 10 篇文章构造解读输入：
     - 优先使用 `content_full_html`
     - 否则使用 `title + summary`
     - HTML 转纯文本 + 压缩空白 + 单篇硬截断（防止单篇超长撑爆）
   - Map：按长度分 chunk（每 chunk 3-5 篇），输出结构化要点（主题、关键事实、差异点、参考链接）
   - Reduce：合成最终解读 HTML
   - 若 Map 输出过长：对 Map 输出执行“递归折叠”（先压缩再 reduce），直到落入预算
7. 标题生成（在用户 prompt 后注入内部提示词）：
   - Reduce 阶段要求模型输出结构化 `{ title, html }`
   - 标题约束：中文、简短、不带日期、不过度营销
   - 失败兜底：使用 `feeds.title`（AI解读源标题）
8. HTML 安全：
   - 对模型输出 HTML 使用 `sanitizeContent()` 清洗后再写入 `articles.content_html`
9. 落库：
   - `articles.feed_id = ai_digest_feed_id`
   - `articles.dedupe_key = 'ai_digest_run:' + runId`（确保幂等）
   - `articles.published_at = now()`（用于排序）
   - `articles.title = aiTitle`
   - `articles.link = null`（或可选设置为内部深链，后续再定）
10. 完成：
   - run: `succeeded`（写入 `article_id`、`selected_count=10` 等）
   - 推进 `ai_digest_configs.last_window_end_at = window_end_at`

错误处理：

- 生成失败时：
  - run: `failed`，记录 `error_code/error_message`
  - 若队列仍有 retry 次数，则抛出错误交给队列重试（保持 `last_window_end_at` 不变）
  - 若已是最终失败（无 retry 次数），则推进 `ai_digest_configs.last_window_end_at = window_end_at`
    - 目的：避免单次窗口卡死导致后续调度完全停滞

### 7) 智能视图与全局操作的隔离点（必须补齐）

为保证“解读文章不进入智能视图”，需要同时处理“查询”和“操作”两类隔离：

#### 7.1 查询隔离

- `src/server/services/readerSnapshotService.ts`
  - 当 `view in ('all','unread','starred')` 时，查询必须限定 `feed_id` 只来自 `feeds.kind='rss'`
  - 当 `view === feedId`（具体订阅源）时，不做排除（这样点进 AI解读源可见）

实现上可选：

- join `feeds` 并加 `feeds.kind='rss'`
- 或使用子查询 `feed_id in (select id from feeds where kind='rss')`

#### 7.2 操作隔离

- `POST /api/articles/mark-all-read` 当前不带 view 语义，`feedId` 缺省时会把所有文章标记已读
  - 需要调整为缺省仅作用于 `feeds.kind='rss'` 的文章（避免“在智能视图里一键已读却把解读源未读也清掉”）
- `refresh_all` / RSS 抓取相关逻辑必须排除 `feeds.kind='ai_digest'`
  - `listEnabledFeedsForFetch()`、`getFeedForFetch()` 等抓取入口只返回 `kind='rss'`

### 8) 测试与验证（建议）

- repo/service 层：
  - “按 `fetched_at` 窗口取候选”查询正确性（包含边界 `start/end`）
  - “分类运行时解析且排除 `ai_digest` feed”正确性
  - rerank shortlist 算法在输入规模扩大时仍能保持“固定上下文大小”的契约（可用 mock LLM）
  - dedupe：同 `runId` 重试不会生成重复文章（依赖 `(feed_id, dedupe_key)`）
- snapshot：
  - `all/unread/starred` 不返回 `ai_digest` articles
  - `view=ai_digest_feed_id` 能返回解读文章
- worker：
  - tick due 逻辑
  - “无更新不生成文章但推进窗口游标”
- API：
  - 创建、立即生成、缺失 API key 的结构化返回

## 开放问题（本版已做默认决策）

- 候选极端多时的成本控制：本版采用“增量 shortlist rerank”保证上下文不爆，但调用次数仍随候选数量线性增长。先按此实现，后续如有性能压力再加软预算（例如候选上限或分层预过滤）。
