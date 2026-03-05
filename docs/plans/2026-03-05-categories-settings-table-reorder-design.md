# 设置中心分类管理表格化与拖拽排序设计

- 日期：2026-03-05
- 状态：已确认（Approved）
- 范围：
  - `src/features/settings/panels/CategoriesSettingsPanel.tsx`
  - `src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
  - `src/features/feeds/FeedList.tsx`
  - `src/features/feeds/AddFeedDialog.tsx`
  - `src/app/api/categories/route.ts`
  - `src/app/api/categories/[id]/route.ts`
  - `src/app/api/categories/reorder/route.ts`（新增）
  - `src/server/repositories/categoriesRepo.ts`

## 1. 背景与目标

当前分类管理面板采用“输入列表 + 行内操作”形态，能够完成基础 CRUD，但存在两个问题：

1. 可扫读性不足，分类名、数量、操作分散，管理效率偏低。
2. 缺乏“分类顺序管理”，无法满足用户对导航结构的可控需求。

本次改造目标：

1. 将分类管理改为基于 `shadcn/ui` 风格的表格化界面。
2. 支持手动拖拽排序并持久化到后端。
3. 排序结果统一影响：
   - 左侧 `FeedList` 分组顺序
   - `AddFeedDialog` 分类下拉顺序
4. 保持已有稳定交互：新增、重命名自动保存、删除二次确认。

## 2. 已确认约束

1. 排序方式采用“拖拽手柄”作为主交互。
2. 允许新增批量重排接口，不使用前端循环单条 PATCH。
3. UI 需要延续设置中心既有视觉语言，组件优先使用 `shadcn/ui`。
4. “未分类”保持系统语义：不可编辑、不可拖拽、固定兜底分组。

## 3. 相关经验与已知约束来源

- 参考总结：`docs/summaries/2026-03-05-rss-feed-dialog-policy-split.md`
  - 启发 1：设置模块应坚持职责收敛，避免把无关配置耦合进同一面板。
  - 启发 2：已有“自动保存 + 提示”链路稳定，优先复用而非重写。

## 4. 方案比较与选型

### 方案 A（采纳）：表格 + 拖拽 + 行内 CRUD

- 形态：`排序 | 分类名称 | 订阅源数量 | 操作`。
- 优点：信息密度高、操作集中、后续可扩展筛选/批量能力。
- 缺点：实现复杂度高于简单列表。

### 方案 B：卡片列表 + 拖拽

- 优点：视觉轻量。
- 缺点：可扫读性弱，设置场景下信息对齐不如表格。

### 方案 C：独立排序模式（进入子页后统一保存）

- 优点：流程明确。
- 缺点：路径更长，不适合高频小调整。

结论：采用方案 A。

## 5. 架构与组件设计

## 5.1 前端结构

`CategoriesSettingsPanel` 改造为表格容器：

1. 顶部工具区：
   - `新分类名称` 输入
   - `添加分类` 按钮
2. 表格区：
   - `排序` 列：拖拽手柄
   - `分类名称` 列：行内输入（`blur/Enter` 保存，`Esc` 回退草稿）
   - `订阅源数量` 列：`Badge` 展示
   - `操作` 列：删除按钮 + `AlertDialog` 二次确认
3. 空态：无分类时显示引导文案。

## 5.2 顺序一致性规则

1. 分类主序：按 `position asc`。
2. `FeedList` 分组顺序：分类主序 + `未分类`固定最后。
3. `AddFeedDialog` 分类下拉：按分类主序显示（不把 `未分类`作为可排序实体）。

## 5.3 状态与乐观更新

1. 拖拽结束后，前端立即重排（乐观更新）。
2. 发送批量重排请求持久化。
3. 失败时：回滚到拖拽前顺序，并拉取一次最新分类兜底同步。
4. 排序保存期间禁用再次拖拽与关键破坏性操作（如删除）。

## 6. API 与数据层设计

## 6.1 新增接口

- `PATCH /api/categories/reorder`
- 请求体：

```json
{
  "items": [
    { "id": "<uuid>", "position": 0 },
    { "id": "<uuid>", "position": 1 }
  ]
}
```

- 语义：原子化批量更新分类顺序。

## 6.2 校验规则

1. `items` 必须为非空数组。
2. 每个 `id` 必须是合法 UUID。
3. `position` 必须是 `>= 0` 的整数。
4. `id` 不可重复，`position` 不可重复。
5. 期望 `position` 连续（0..n-1），否则返回 `validation_error`。

## 6.3 Repository 设计

在 `categoriesRepo` 增加 `reorderCategories(pool, items)`：

1. 事务内执行。
2. 校验所有 `id` 均存在。
3. 批量更新 `position` 与 `updated_at`。
4. 返回更新后的分类列表（按 `position asc, name asc`）。

## 7. 交互细节

1. 新增分类：成功后插入末尾并显示成功提示。
2. 重命名：保留自动保存行为与错误提示机制。
3. 删除分类：保留确认弹窗；成功后分类移除，关联 feed 继续遵循“归并未分类”语义。
4. 拖拽排序：
   - 仅普通分类可拖拽
   - 拖拽完成即保存
   - 成功提示“排序已保存”

## 8. 错误处理

1. `validation_error`：提示“排序数据无效，请刷新后重试”。
2. `conflict`：提示“分类状态冲突，请刷新后重试”。
3. 其他错误：提示“排序保存失败，请稍后重试”。
4. 错误后动作：回滚本地顺序 + 重新拉取分类。

## 9. 测试策略

1. `CategoriesSettingsPanel.test.tsx`
   - 新增/重命名/删除回归
   - 拖拽排序成功场景
   - 拖拽排序失败回滚场景
2. `src/app/api/categories/routes.test.ts`
   - 新增 `PATCH /api/categories/reorder` 成功与失败校验
3. `src/server/repositories/repositories.integration.test.ts`
   - `reorderCategories` 原子更新与排序结果断言
4. `FeedList` / `AddFeedDialog` 相关测试
   - 验证分类顺序消费一致性

## 10. 验收标准

1. 分类管理界面为表格形态，风格与设置中心一致。
2. 支持拖拽排序且刷新后顺序保持。
3. `FeedList` 与 `AddFeedDialog` 顺序与分类排序一致。
4. 分类 CRUD 基本能力无回归。
5. 相关单元测试通过，`lint` 无新增错误。

## 11. 非目标

1. 本期不做批量删除、搜索筛选、分页。
2. 本期不重构设置中心导航结构。
3. 本期不改变“未分类”作为系统兜底分组的语义。
