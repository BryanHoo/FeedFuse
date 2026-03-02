## Context

现有中栏 `ArticleList` 仅渲染卡片样式，且显示模式不存在持久化语义。项目已具备 feed 级持久化配置链路（例如 `fullTextOnOpenEnabled`、`aiSummaryOnOpenEnabled`），可复用于本次需求。  
本次需求已确认以下产品约束：按 `feed` 持久化、聚合视图固定 `card`、feed 首次默认 `card`、`list` 保留分组与未读标记、切换按钮在刷新按钮左侧。

## Goals / Non-Goals

**Goals:**

- 在数据库与 API 层提供 `articleListDisplayMode` 的强类型读写。
- 在 feed 视图实现 `card/list` 切换并持久化。
- 在聚合视图统一强制 `card` 且隐藏切换入口。
- 保证失败可回滚，并通过现有通知系统反馈。
- 覆盖 migration/repository/API/UI 测试，确保行为可回归。

**Non-Goals:**

- 不为 `all/unread/starred` 提供可配置显示模式。
- 不新增第三种显示模式。
- 不修改右栏 `ArticleView` 阅读交互。
- 不进行 UI 大改，仅实现最低必要结构变化。

## Decisions

### Decision 1: 将显示模式作为 `feeds` 表字段持久化

- 选择：新增 `article_list_display_mode text not null default 'card'` + `check` 约束。
- 原因：语义属于 feed 配置；与现有 feed 级选项一致；跨设备一致。
- 备选：
  - 存 `settings`：语义偏用户设置，配置分散。
  - 存 `localStorage`：仅单设备生效，不满足持久化预期。

### Decision 2: 聚合视图在前端强制 `card`

- 选择：`selectedView` 为 `all/unread/starred` 时忽略 feed 字段并隐藏切换按钮。
- 原因：需求明确固定卡片；避免聚合场景出现不一致认知。
- 备选：保留按钮但禁用/提示，会增加心智负担与无效操作。

### Decision 3: 切换采用乐观更新 + 失败回滚

- 选择：先更新 store 中目标 feed 模式，再 `patchFeed`；失败时回滚并 `notify.error`。
- 原因：提升交互响应速度，复用现有错误提示机制。
- 备选：等待接口成功后再更新 UI，会导致切换延迟且体验较差。

### Decision 4: `list` 模式复用既有分组计算

- 选择：沿用 `articleSections` 逻辑，仅替换行渲染结构。
- 原因：减少风险与重复逻辑，满足“保留日期分组”要求。
- 备选：独立列表数据通道会增加维护成本，违反 YAGNI。

## Risks / Trade-offs

- [Risk] migration 字段默认值/约束遗漏导致线上脏数据  
  → Mitigation：增加 migration test + repo/API 断言新字段存在。

- [Risk] 乐观更新回滚逻辑遗漏，可能出现 UI 与服务端不一致  
  → Mitigation：增加 `ArticleList` 失败回滚测试并在实现中统一单出口处理。

- [Risk] `list` 模式压缩信息后可读性下降  
  → Mitigation：保留未读标记与相对时间，标题使用单行截断并保留 hover/title。

## Migration Plan

1. 新增 migration `0008_feed_article_list_display_mode.sql`，加列、默认值、约束。  
2. 扩展 repository 与 API schema，确保字段可读写。  
3. 扩展 snapshot DTO + 前端类型映射。  
4. 实现 `ArticleList` 切换按钮与 `list` 渲染。  
5. 先跑增量测试，再跑完整 `test:unit` 与 `lint`。  

Rollback strategy：

- 若回滚代码，保留新列不影响旧逻辑（旧逻辑默认按 `card` 渲染）。
- 若需数据库回滚，可单独执行逆向 migration（删除列前需确认无依赖代码在运行）。

## Open Questions

- 无阻塞问题。实施时按本设计直接推进。
