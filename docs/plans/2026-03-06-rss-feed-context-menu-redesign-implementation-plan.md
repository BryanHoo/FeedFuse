# RSS 源右键菜单重设计 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 让 RSS 源右键菜单从默认组件样式升级为具备精致工具感的高频管理浮层，并同步增强分区、图标、状态反馈和危险操作表达。

**Architecture:** 共享菜单视觉系统下沉到 `src/components/ui/context-menu.tsx`，业务层 `src/features/feeds/FeedList.tsx` 只负责菜单结构、图标语义和状态文案。数据语义与提交链路保持不变，继续复用现有 `updateFeed -> loadSnapshot` 流程。

**Tech Stack:** Next.js 16、React 19、TypeScript、Tailwind CSS v4、Radix Context Menu、Vitest、Testing Library、Lucide React

---

## 相关经验与约束

- 设计文档：[`docs/plans/2026-03-06-rss-feed-context-menu-redesign-design.md`](./2026-03-06-rss-feed-context-menu-redesign-design.md)
- 相关总结：[`docs/summaries/2026-03-06-rss-feed-context-menu-move-category.md`](../summaries/2026-03-06-rss-feed-context-menu-move-category.md)
- 相关总结：[`docs/summaries/2026-03-06-feed-category-inline-management.md`](../summaries/2026-03-06-feed-category-inline-management.md)
- 相关总结：[`docs/summaries/2026-03-05-rss-feed-dialog-policy-split.md`](../summaries/2026-03-05-rss-feed-dialog-policy-split.md)

实现原则：

1. 严格遵循 TDD：先写失败测试，再写最小实现。
2. 保持业务逻辑不变，只升级表现层和信息结构。
3. 测试聚焦行为、状态与可访问性，不把纯视觉 class 断言写死。
4. 共享组件 API 保持轻量，避免过度设计。

### Task 1: 为菜单重构建立失败测试与辅助断言

**Files:**

- Modify: `src/features/feeds/FeedList.test.tsx`

**Step 1: Write the failing test**

在 `src/features/feeds/FeedList.test.tsx` 新增或整理以下用例：

1. 断言 `编辑` 菜单项仍可打开编辑弹窗。
2. 断言 `移动到分类` 子菜单当前分类仍可见且处于禁用状态。
3. 断言如果新增 `当前` 文案或明显状态提示，该状态会出现在当前分类项上。
4. 断言 `删除` 仍能以 `menuitem` 角色被查询到。

建议增加一个复用工具函数，统一打开 RSS 源右键菜单和分类子菜单，避免测试重复。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "current category"
```

Expected: FAIL，因为当前菜单实现尚未渲染新的状态提示或新的结构语义。

**Step 3: Write minimal implementation**

此任务不修改生产代码，只确认测试确实对准目标。

**Step 4: Run test to verify it fails as expected**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "current category"
```

Expected: FAIL，且失败原因明确指向缺少新状态表达。

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.test.tsx
git commit -m "test(feeds): 约束右键菜单重设计结构"
```

### Task 2: 升级共享菜单容器与基础条目视觉系统

**Files:**

- Modify: `src/components/ui/context-menu.tsx`
- Test: `src/features/feeds/FeedList.test.tsx`

**Step 1: Write the failing test**

如果 Task 1 尚未覆盖，可补充一个轻量结构断言，确保共享组件升级后仍不破坏 `menuitem` 查询与 `submenu` 打开行为。

```tsx
it('keeps menu items accessible after menu visual redesign', async () => {
  renderWithNotifications();
  fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

  expect(await screen.findByRole('menuitem', { name: '编辑' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '删除' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it passes or remains green**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "accessible after menu visual redesign"
```

Expected: PASS 或如果新增断言更严格则先 FAIL。无论结果如何，都以保持角色语义不回归为目标。

**Step 3: Write minimal implementation**

在 `src/components/ui/context-menu.tsx`：

1. 升级 `ContextMenuContent` / `ContextMenuSubContent` 容器样式，加入深色玻璃感、细描边、模糊和更强阴影。
2. 升级 `ContextMenuItem` / `ContextMenuSubTrigger` 的交互样式，使 hover / focus 更明确。
3. 升级 `ContextMenuSeparator` 的视觉风格。

注意：

1. 保持 Radix 组件层级和 refs 完整。
2. 不引入新的状态管理。
3. 不在此任务里加入业务图标或文案。

**Step 4: Run scoped tests**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "opens context menu and edits title"
```

Expected: PASS。

**Step 5: Commit**

```bash
git add src/components/ui/context-menu.tsx src/features/feeds/FeedList.test.tsx
git commit -m "feat(ui): 升级右键菜单视觉系统"
```

### Task 3: 为共享菜单添加轻量结构组件

**Files:**

- Modify: `src/components/ui/context-menu.tsx`

**Step 1: Write the failing test**

复用 Task 1 / Task 2 的测试，不额外新增针对纯展示组件的测试；重点通过业务菜单行为验证结构包装不会破坏菜单操作。

**Step 2: Run targeted regression test before refactor**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "opens context menu and edits title"
```

Expected: PASS，作为重构前基线。

**Step 3: Write minimal implementation**

在 `src/components/ui/context-menu.tsx` 新增以下轻量包装组件：

```tsx
const ContextMenuItemIcon = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/90', className)} {...props} />
);

const ContextMenuItemLabel = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('min-w-0 flex-1 truncate', className)} {...props} />
);

const ContextMenuItemHint = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-[11px] font-medium text-muted-foreground/80', className)} {...props} />
);
```

如有必要，可为 `ContextMenuItem` / `ContextMenuSubTrigger` 增加 `destructive` 或 `active` 之类的样式变体，但保持 API 简洁。

**Step 4: Run regression test**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "opens context menu and edits title"
```

Expected: PASS。

**Step 5: Commit**

```bash
git add src/components/ui/context-menu.tsx
git commit -m "feat(ui): 增加右键菜单项结构组件"
```

### Task 4: 在 FeedList 中重组右键菜单信息架构与图标语义

**Files:**

- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`

**Step 1: Write the failing test**

在 `src/features/feeds/FeedList.test.tsx` 增加或更新断言：

1. `移动到分类` 子菜单中的当前分类项出现 `当前` 提示。
2. `删除` 仍可被 `menuitem` 查询到。
3. 菜单分区调整后，`编辑`、`AI摘要配置`、`翻译配置`、`停用 / 启用`、`删除` 仍能逐个查询。

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "current category"
```

Expected: FAIL，因为当前菜单项尚未包含新的状态提示与结构。

**Step 3: Write minimal implementation**

在 `src/features/feeds/FeedList.tsx`：

1. 引入需要的 Lucide 图标。
2. 使用 `ContextMenuItemIcon`、`ContextMenuItemLabel`、`ContextMenuItemHint` 组织菜单项。
3. 在 `编辑`、`移动到分类`、`AI摘要配置`、`翻译配置`、`停用 / 启用`、`删除` 中加入语义图标。
4. 用 separator 重组菜单节奏，使四个语义区更清晰。
5. 在分类子菜单当前项增加 `当前` 提示，`未分类` 同理。

注意：

1. 不修改现有事件处理。
2. 不修改提示文案的业务含义。
3. `删除` 的危险语义通过样式变体表达，而不是改变流程。

**Step 4: Run targeted tests**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "opens context menu and edits title|current category|uncategorized"
```

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "feat(feeds): 重构RSS源右键菜单交互表达"
```

### Task 5: 跑完整的 FeedList 范围回归

**Files:**

- Verify: `src/features/feeds/FeedList.test.tsx`

**Step 1: Run focused file tests**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx
```

Expected: PASS，且与菜单相关用例全部通过。

**Step 2: If failures appear, fix the smallest regression**

仅修复与本次菜单重设计直接相关的问题，不扩散到无关行为。

**Step 3: Re-run focused file tests**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx
```

Expected: PASS。

**Step 4: Commit**

```bash
git add src/components/ui/context-menu.tsx src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "test(feeds): 验证右键菜单重设计回归"
```

### Task 6: 跑更广范围验证并记录结果

**Files:**

- Verify: `src/components/ui/context-menu.tsx`
- Verify: `src/features/feeds/FeedList.tsx`
- Verify: `src/features/feeds/FeedList.test.tsx`

**Step 1: Run lint**

Run:

```bash
pnpm run lint
```

Expected: PASS。

**Step 2: Run broader unit tests if time permits**

Run:

```bash
pnpm run test:unit
```

Expected: PASS；如果仓库较大，至少记录与本次改动范围无关的失败情况。

**Step 3: Document result in final summary**

记录实际执行的命令、结果和任何已知限制。

**Step 4: Commit**

```bash
git add docs/plans/2026-03-06-rss-feed-context-menu-redesign-design.md docs/plans/2026-03-06-rss-feed-context-menu-redesign-implementation-plan.md
git commit -m "docs(feeds): 新增右键菜单重设计方案"
```
