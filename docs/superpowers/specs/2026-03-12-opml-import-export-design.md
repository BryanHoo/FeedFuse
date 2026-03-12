# OPML 导入导出设计

- 日期：2026-03-12
- 状态：已确认
- 需求：在“设置 > RSS”中添加 OPML 导入导出能力。导入与导出仅保留订阅的 `title`、`xmlUrl`、分类；重复订阅默认跳过；导入后不自动触发抓取；仅在 OPML 结构损坏时整份失败。

## 背景

当前项目已有完整的单条订阅新增与编辑链路：

- 前端通过 `src/lib/apiClient.ts` 调用 `POST /api/feeds`、`PATCH /api/feeds/:id`
- 客户端状态由 `src/store/appStore.ts` 维护
- 分类生命周期由 `src/server/services/feedCategoryLifecycleService.ts` 统一处理
- 设置中心 RSS 面板位于 `src/features/settings/panels/RssSettingsPanel.tsx`

现状中不存在 OPML 相关能力，但已有两条可以复用的重要约束：

- 单个新增订阅的 `addFeed` 流程会立即触发 `refreshFeed` 与 snapshot 轮询，这不适合批量导入
- 分类的创建、复用与清理已经集中在现有 lifecycle service 中，不应在 OPML 逻辑里重复实现一套

因此，OPML 设计需要做到：

- 与现有分类规则保持一致
- 避免复用单条新增的“导入后立即抓取”语义
- 将批量解析、去重与结果汇总集中在服务端

## 目标

- 在“设置 > RSS”提供 OPML 导入与导出入口
- 兼容标准 OPML，导入与导出仅围绕 `title`、`xmlUrl`、分类
- 导入时支持部分成功，并给出结构化结果摘要
- 导入后统一刷新 snapshot，但不自动抓取新订阅
- 导出全部订阅，包括已禁用 feed

## 非目标

- 不在左侧订阅列表增加 OPML 入口
- 不通过私有 OPML 扩展保存 `enabled`、`fullTextOnOpenEnabled`、翻译/摘要开关、抓取间隔等 feed 级配置
- 不在第一版加入“导入预览”“冲突逐条选择”“导出范围选择”
- 不把 OPML 导入接入队列异步任务

## 备选方案

### 方案 A：纯前端解析 + 逐条调用 `POST /api/feeds`

前端使用 `DOMParser` 解析 OPML，再逐条调用现有新增订阅接口。

优点：

- 表面改动较少

缺点：

- 大量网络往返，批量行为不稳定
- 重复检测、部分失败统计、分类映射逻辑分散在前端
- 很难避免误复用单条新增的自动抓取语义

### 方案 B：专用 OPML 服务端接口（推荐）

增加专用 import/export API，前端只负责文件输入、按钮触发和结果展示；服务端统一完成 XML 解析、去重、分类落库与导出生成。

优点：

- 批量规则集中，结果可控
- 更容易复用现有分类生命周期服务
- 错误处理、测试边界和后续扩展都更清晰

### 方案 C：后台任务异步导入

上传文件后进入队列，前端轮询任务状态。

优点：

- 适合极大文件和复杂清洗

缺点：

- 对当前需求明显过重
- 当前导入后不自动抓取，没必要先引入任务模型

## 推荐方案

采用方案 B：新增专用 OPML 服务端接口，由服务端统一处理导入导出逻辑。

理由：

- 与当前“标准 OPML + 保留标题/URL/分类 + 重复跳过 + 部分成功”的需求最契合
- 可以避开 `addFeed` 的自动抓取副作用
- 能最大化复用 `feedCategoryLifecycleService`

## 已确认设计

### 1. 架构与数据流

OPML 能力放在“设置 > RSS”面板中，前端只负责交互与展示，服务端负责解析与生成。

新增 API：

- `POST /api/opml/import`
  - 输入：OPML 文件内容
  - 输出：结构化导入结果
- `GET /api/opml/export`
  - 输出：标准 OPML XML，用于浏览器下载

导入流程：

1. 用户在 `RssSettingsPanel` 点击“导入 OPML”
2. 前端选择文件并提交给 `POST /api/opml/import`
3. 服务端解析 XML，提取 feed 条目与分类
4. 服务端按 URL 去重，并复用 `feedCategoryLifecycleService` 创建 feed 与缺失分类
5. 服务端返回导入摘要
6. 前端展示结果摘要，并调用 `loadSnapshot({ view: selectedView })` 刷新现有阅读器状态

导出流程：

1. 用户点击“导出 OPML”
2. 前端调用 `GET /api/opml/export`
3. 服务端按当前 feed 与分类生成标准 OPML
4. 前端触发文件下载

明确约束：

- OPML 导入不复用 `src/store/appStore.ts` 中的 `addFeed` 批量执行
- 导入成功后只刷新 snapshot，不触发 `refreshFeed` 或批量抓取

### 2. 数据模型与解析规则

第一版 OPML 只围绕以下三类数据建模：

- 订阅标题：`title`
- 订阅地址：`xmlUrl`
- 分类：`category`

导入规则：

- 带 `xmlUrl` 的 `outline` 视为 feed 条目
- 位于分类 `outline` 下的 feed 条目，分类名取父级 `outline` 的 `text`，缺失时回退到 `title`
- 若 OPML 出现多层分类嵌套，而本地模型只支持单一分类，则取离 feed 最近的祖先分类 `outline` 作为分类；更上层路径不做拼接保存
- 根级 feed 条目视为未分类
- feed 标题优先取 `text`，其次取 `title`，若都缺失则回退为 `xmlUrl`
- `xmlUrl` 必须是合法的 `http/https` URL，否则记为无效条目
- 同一份 OPML 内的重复 `xmlUrl`，后出现的条目记为重复并跳过
- 数据库中已存在的 `xmlUrl`，记为重复并跳过
- 条目级错误不阻断其他条目导入

导出规则：

- 根节点使用标准 `opml version="2.0"`
- `head` 写入简单标题，例如 `FeedFuse Subscriptions`
- 有分类的 feed 按分类分组输出到分类 `outline`
- 未分类 feed 直接输出到 `body` 根下，不输出“未分类”分组
- feed 条目至少输出 `text`、`title`、`type="rss"`、`xmlUrl`
- 若存在 `siteUrl`，可额外输出 `htmlUrl`，但导入逻辑不依赖该字段
- 导出顺序应保持可预测：分类按现有分类顺序输出，分类内 feed 按当前仓库默认顺序输出，未分类 feed 统一放在分类分组之后

### 3. 组件边界、API 形状与用户反馈

前端入口只放在 `src/features/settings/panels/RssSettingsPanel.tsx`，不修改 `src/features/feeds/FeedList.tsx` 的主导航职责。

前端新增能力：

- “导入 OPML”按钮与隐藏文件选择器
- “导出 OPML”按钮
- 最近一次导入结果摘要展示区域

建议在 `src/lib/apiClient.ts` 中新增：

- `importOpml(input: { content: string; fileName?: string | null })`
- `exportOpml()`

建议导入结果 contract 至少包含：

- `importedCount`
- `duplicateCount`
- `invalidCount`
- `createdCategoryCount`
- `duplicates`
- `invalidItems`

第一版 UI 不必展开所有明细，但接口层保留 `duplicates`、`invalidItems`，便于后续扩展更细的结果面板。

用户反馈分两层：

- 使用 toast 提供即时成功/失败反馈
- 在 RSS 面板中展示最近一次导入摘要，避免批量结果只存在短暂 toast 中

服务端建议分层：

- API route：解析请求、包装响应、映射错误
- OPML service：解析 XML、标准化条目、执行批量导入、生成导出 XML
- repository / 现有 lifecycle service：负责具体数据库写入与分类规则

### 4. 错误处理与验证策略

错误分为三层：

#### 文件级失败

整份导入失败，不执行部分成功：

- XML 非法
- 根结构不是可识别的 OPML
- 请求体为空或无法读取为文本

这类错误应返回明确的 validation/error code，而不是 500。

补充约束：

- 若 OPML 结构合法，但文件中没有任何 feed 条目，返回结构化成功结果，`importedCount = 0`
- 若 OPML 结构合法，但所有条目都因 URL 缺失、URL 非法或重复而未导入，也返回结构化结果，不升级为文件级失败

#### 条目级跳过

不终止整份导入，只进入结果统计：

- 缺失 `xmlUrl`
- `xmlUrl` 不是合法 `http/https`
- 同文件内重复 URL
- 数据库中已存在相同 URL

这类结果分别计入 `invalidCount` 或 `duplicateCount`。

#### 系统级失败

例如数据库异常、未预期错误、事务失败。这类情况按真正失败处理。

导入执行策略建议为：

- 按条目独立落库并汇总结果
- 不采用“整份文件单事务”，以免与“部分成功”目标冲突
- 单条创建继续依赖现有服务层原子性

## 测试设计

### 1. OPML service 单元测试

覆盖：

- 分类下 feed 条目的分类提取
- 根级 feed 视为未分类
- `text` / `title` 缺失时的标题回退
- 无效 URL 判定
- 同文件重复 URL 去重
- 导出 XML 的分组结构正确

### 2. API route 测试

覆盖：

- `POST /api/opml/import` 在文件级错误时返回预期错误
- `POST /api/opml/import` 在部分成功时返回正确统计
- `GET /api/opml/export` 返回 XML `content-type` 与下载头
- 非预期异常时返回统一错误 envelope

### 3. 前端面板测试

重点验证 `src/features/settings/panels/RssSettingsPanel.tsx`：

- 能触发文件选择并提交导入
- 导入成功后展示摘要
- 导入成功后触发 `loadSnapshot`
- 导出按钮能触发下载流程
- 按钮 `aria-label` 与可见文案保持中文，避免再次出现内部 token 暴露问题

### 4. 分类生命周期集成回归

覆盖：

- 导入新分类时复用现有分类创建逻辑
- 分类名仅大小写或空格差异时不会重复创建分类
- 重复 feed URL 不会污染已有数据

## 后续实现约束

- implementation plan 应优先设计服务端 OPML service，再接 API route，最后接入 RSS 设置面板
- 实现阶段必须避免把 OPML 逻辑散落到 `RssSettingsPanel` 以外的前端组件中
- 实现阶段必须确保导入不会触发批量抓取任务
- 实现阶段应保证空 OPML 与“全部条目被跳过”的结果可被前端摘要清晰呈现，而不是统一映射成失败 toast
