# 跨源重复文章过滤设计

## 背景

当前 FeedFuse 已支持基于关键词和 AI 提示词的文章过滤，但这两类能力都只在单篇文章维度判断“这篇是否值得看”。现有入库侧的 `dedupeKey` 仅用于防止同一个 feed 重复抓取同一篇文章，不能解决多个源同时转载或轻度改写同一篇内容的问题。

用户希望新增一层“跨源重复文章过滤”能力，用于过滤多个源返回的相同或相似文章，减少中栏被重复转载占满的情况，同时保持现有“查看已过滤文章”模式的可见性规则。

本次需求已明确约束如下：

- 目标是“硬过滤”，不是聚合展示
- 覆盖范围为“严格重复 + 近似转载”，不扩展到宽泛的同主题聚类
- 比较窗口固定为 `72 小时`
- 命中时保留最早入库的一篇作为代表文章
- 默认中栏隐藏这类文章
- 在具体 feed 开启“查看已过滤文章”模式后，这类文章必须可见

## 目标

- 在现有文章过滤链路内新增跨源重复 / 相似转载过滤能力
- 尽量在 AI 过滤与 AI 后处理之前拦截重复文章，减少重复计算
- 保持现有阅读列表可见性模型不变，仅新增一种过滤原因
- 为后续误判排查、规则迭代和可能的回填保留必要元数据

## 非目标

- 不实现 story clustering 或“合并成一条并展开更多来源”
- 不实现用户可调的相似度阈值或时间窗口
- 不实现 feed 优先级保留策略
- 不引入 embeddings、`pgvector` 或外部向量检索基础设施
- 不用 AI 模型直接裁决“是否为同一篇转载”
- 不对历史全量文章做一次性回溯重算，第一版仅覆盖进入过滤链路的新文章

## 方案对比

### 方案 A：仅元数据去重

只比较 `same URL`、规范化 URL、标题完全相同或标题高度相似。

优点：

- 实现最小，接近 Inoreader 的 duplicate filters 边界
- 误杀率相对最低
- 数据模型和查询都较简单

缺点：

- 对“标题轻改但正文大体相同”的转载命中不足
- 无法覆盖多个站点复制正文但替换链接或导语的常见情况

### 方案 B：两阶段去重

先做确定性规则命中，再对候选文章做内容近似判定。

优点：

- 能覆盖“严格重复 + 近似转载”的核心场景
- 比纯 AI 判定更稳定、便宜、可解释
- 能自然嵌入现有 `article.filter` worker

缺点：

- 需要新增文章元数据字段和索引
- 需要实现内容标准化与指纹生成逻辑

### 方案 C：AI 裁决重复关系

先召回候选文章，再交给模型判断两篇文章是否属于同一篇转载。

优点：

- 对改写标题、不同摘要风格的判断弹性更大

缺点：

- 成本和延迟显著更高
- 结果稳定性差，误判后难解释
- 与本次“默认隐藏”的产品要求不匹配，风险过高

## 结论

采用方案 B：在现有过滤 worker 中新增“跨源重复判定”子阶段，使用“确定性规则 + 内容指纹”的两阶段策略完成过滤。

## 外部参考

- Feedly 将 deduplication 与 clustering 拆成两层，前者处理高重合内容，后者处理同主题聚合  
  https://docs.feedly.com/article/218-how-does-deduplication-work  
  https://docs.feedly.com/article/552-what-is-clustering  
  https://feedly.com/engineering/posts/reducing-clustering-latency
- Inoreader 的 duplicate filters 提供 `Same URL / Same title / Nearly identical titles` 和时间窗口思路  
  https://www.inoreader.com/blog/2026/01/save-time-with-automations.html
- SimHash 适合近似重复文档检测，第一版可在不引入向量基础设施的前提下完成近似转载过滤  
  https://dblp.org/rec/conf/stoc/Charikar02

## 架构设计

本次能力不作为新的独立队列或新的前台查询层，而是作为 `article.filter` 工作流中的一个子阶段。

推荐过滤顺序如下：

1. 关键词预过滤
2. 跨源重复判定
3. 按需抓取全文
4. AI 过滤
5. AI 摘要、翻译等后续自动触发

这样安排的原因：

- 重复文章不值得继续消耗全文抓取、AI 过滤与 AI 后处理成本
- “是否已在别处出现过”比“是否符合内容过滤规则”更前置
- 复用现有 `article.filter` 作为统一过滤入口，边界最清晰

建议新增独立服务模块，例如 `src/server/services/articleDuplicateService.ts`，只负责：

- 规范化标题、链接和候选文本
- 计算文章内容指纹
- 查询 `72 小时` 窗口内候选文章
- 返回重复判定结果与元数据

`articleFilterWorker` 仅负责 orchestration，不承担去重算法细节。

## 核心产品规则

- 去重窗口固定为 `72 小时`
- 仅过滤“严格重复 + 近似转载”
- 不过滤只是讲述同一主题、但内容已明显重写的文章
- 命中重复时，始终保留最早入库的一篇
- 新文章只能指向更早文章，不允许后来文章反向覆盖已保留的代表文章
- 命中重复后，将文章写为正式过滤结果，而不是只在查询层临时隐藏
- 过滤原因新增 `duplicate`

## 可见性设计

默认视图沿用现有逻辑，仅显示 `filterStatus in ('passed', 'error')` 的文章。因此被标记为重复的文章会自然从默认中栏消失。

在具体 feed 上开启“查看已过滤文章”模式时，沿用现有 `includeFiltered` 规则，将 `filtered` 状态文章一并带入中栏。因此重复过滤文章不需要新的读取通道，只需保证被持久化为正式过滤结果即可。

为了降低排查成本，建议在“查看已过滤文章”模式下为这类文章增加轻量说明文案，例如：

- `已过滤：重复/相似转载`
- 如果存在代表文章引用，可补充“与更早文章重复”

这不是新的交互模式，只是现有已过滤视图中的原因补充。

## 判定模型

### 第一阶段：确定性命中

如果新文章与窗口内某篇候选文章满足以下任一条件，则直接判为重复：

- `normalized_link` 相同
- `normalized_title` 完全相同，且发布时间距离足够近
- 后续如全文抓取拿到 canonical URL，可扩展为 `canonical_url` 相同

### 第二阶段：近似转载命中

当第一阶段未命中时，再做内容近似判定。

候选文本生成顺序：

1. `content_full_html`
2. `content_html`
3. `title + summary`

标准化步骤：

- 去 HTML 标签
- 小写化
- 去标点和多余空白
- 过滤极短或无意义 token
- 对标准化文本生成 shingles
- 计算稳定的内容指纹

第一版推荐使用 `SimHash` 风格的内容指纹，而不是向量相似度或 AI 裁决。

原因：

- 与“近似重复文档检测”问题更匹配
- 不需要额外基础设施
- 能在候选窗口已经很小的前提下稳定运行

## 数据结构

建议通过新 migration 在 `articles` 表上新增以下字段：

- `normalized_title text null`
- `normalized_link text null`
- `content_fingerprint text null`
- `duplicate_of_article_id bigint null references articles(id) on delete set null`
- `duplicate_reason text null`
- `duplicate_score real null`
- `duplicate_checked_at timestamptz null`

字段说明：

- `normalized_title`：保存标准化标题，便于等值召回
- `normalized_link`：保存去追踪参数、归一化后的链接
- `content_fingerprint`：保存近似重复计算后的稳定指纹；建议第一版使用十六进制文本表示
- `duplicate_of_article_id`：指向被保留的代表文章
- `duplicate_reason`：记录命中原因，便于解释和统计
- `duplicate_score`：记录相似度分数；确定性命中时可为空或固定为 `1`
- `duplicate_checked_at`：标记该文章何时完成去重判断

建议为 `duplicate_reason` 限定第一版取值范围：

- `same_normalized_url`
- `same_title`
- `similar_content`

## 索引设计

建议补充以下索引：

- `articles (published_at desc, id desc)`，用于窗口候选查询
- `articles (normalized_link)`，用于 URL 等值命中
- 如需要进一步限制扫描范围，可增加 `articles (normalized_title, published_at desc, id desc)`

现有 `filter_status` 相关索引可继续复用，不需要为第一版单独引入 cluster 级表结构。

## 候选召回与代表选择

候选召回仅在 `72 小时` 窗口内进行，并只与“当前文章之前已存在的文章”比较。

推荐流程：

1. 先按 `normalized_link` 等值召回
2. 再按 `normalized_title` 等值召回
3. 仍未命中时，再从窗口内挑选符合最小文本长度门槛的候选做内容指纹比较
4. 所有命中结果中，按入库顺序选择最早文章作为代表文章

这样可以保证：

- 最早入库文章天然稳定为代表
- 不会出现两个新文章互相将对方判为重复的情况
- 并发场景下最坏只是少量漏判，不会出现双向误过滤

## 并发与竞态处理

`article.filter` worker 会并发运行，因此需要刻意限制判定方向。

第一版采用保守规则：

- 只允许“新文章指向旧文章”
- 候选文章按入库顺序筛选最早代表
- 不做代表迁移或重平衡

这样可避免两类坏结果：

- 两篇文章互相把对方标为重复
- 已保留文章被后来内容更完整的转载反向替换

如果未来需要进一步收紧并发一致性，可以在第二版引入事务锁或独立的归并表，但不建议第一版就做。

## 过滤结果写入规则

命中重复时，当前文章写入以下结果：

- `filterStatus = 'filtered'`
- `isFiltered = true`
- `filteredBy` 包含 `duplicate`
- `filterErrorMessage = null`
- 同时写入去重元数据：`duplicate_of_article_id`、`duplicate_reason`、`duplicate_score`、`duplicate_checked_at`

未命中重复时，仍建议写入：

- `normalized_title`
- `normalized_link`
- `content_fingerprint`
- `duplicate_checked_at`

以便后续转载文章复用这些中间结果。

## 实现边界

### `src/server/services/articleDuplicateService.ts`

- 新增标准化与去重判定服务
- 对外暴露纯输入输出结果，便于单元测试

### `src/server/repositories/articlesRepo.ts`

- 扩展文章读写字段
- 增加去重元数据更新方法，或合并进现有过滤结果写入方法
- 提供 `72 小时` 候选查询接口

### `src/worker/articleFilterWorker.ts`

- 在关键词预过滤后插入重复判定
- 命中时提前结束，不再触发全文抓取、AI 过滤与 AI 后处理

### `src/server/services/readerSnapshotService.ts`

- 复用现有 `includeFiltered` 查询规则
- 如产品需要，在中栏 DTO 中透出重复原因描述或代表文章引用

### 数据迁移

- 新增 `articles` 字段与索引
- 保持历史数据兼容，旧文章字段允许为空

## 第一版最小上线范围

第一版固定以下边界，不做额外配置项：

- 时间窗口固定 `72 小时`
- 策略固定为“确定性规则 + 内容指纹”
- 代表文章固定为最早入库
- 只新增过滤原因 `duplicate`
- 默认隐藏、`includeFiltered` 时可见

这能让需求保持在“现有过滤系统的一个新原因”范围内，而不是演变为新的内容聚合系统。

## 测试策略

至少覆盖以下几层测试：

### 1. 单元测试

- 标题标准化
- 链接标准化
- 内容抽取与指纹生成
- 相似度阈值判定

### 2. 服务测试

- `same_normalized_url` 命中
- `same_title` 命中
- 标题轻改但正文高度相似时命中
- 文本过短时不走 `similar_content`
- 超过 `72 小时` 窗口不命中

### 3. Worker 测试

- 命中重复时写入 `filtered` 结果
- `filteredBy` 包含 `duplicate`
- 命中重复后不再继续全文抓取、AI 过滤和 AI 自动触发

### 4. 快照 / 查询测试

- 默认视图隐藏重复过滤文章
- 具体 feed 开启 `includeFiltered` 后可查看这类文章
- 已过滤视图中的分页和总数行为保持稳定

## 风险与约束

- 文本过短的文章很难稳定判断近似转载，第一版应保守处理
- 轻度改写但内容仍相同的转载，阈值过高会漏判，阈值过低会误杀摘要类内容
- 默认隐藏要求判定稳定，因此第一版不应引入 AI 裁决
- 并发场景下第一版允许极低概率漏判，但必须避免双向误过滤

## 验收标准

- 多个源在 `72 小时` 内返回严格重复或近似转载文章时，系统只保留最早入库的一篇
- 被判为重复的文章写入正式过滤结果，`filteredBy` 包含 `duplicate`
- 默认中栏不显示这类文章
- 在具体 feed 开启“查看已过滤文章”模式后，这类文章可在中栏查看
- 命中重复后不会继续触发 AI 过滤、摘要或翻译等高成本流程
- 数据库中保留足够的去重元数据，支持后续排查与规则演进
