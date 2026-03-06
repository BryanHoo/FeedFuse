# RSS 源右键移动分类功能 Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 在 `FeedList` 的 RSS 源右键菜单中加入 `移动到分类` 子菜单，让用户可以直接把订阅源移动到现有分类或 `未分类`，并保持现有 snapshot 同步语义不变。

**Architecture:** 复用 `src/features/feeds/FeedList.tsx` 中现有的 RSS 源右键菜单、`src/components/ui/context-menu.tsx` 里已存在的 `ContextMenuSub` 组件，以及 `useAppStore().updateFeed` 的 `patchFeed -> loadSnapshot` 链路。实现只改前端菜单与测试，不新增 store action、不修改服务端 API 契约。

**Tech Stack:** React 19, Next.js 16, Zustand, Radix Context Menu, Vitest, React Testing Library, ESLint

---

## 执行前上下文

- 设计文档：[`docs/plans/2026-03-06-rss-feed-context-move-category-design.md`](./2026-03-06-rss-feed-context-move-category-design.md)
- 相关总结：
  - [`docs/summaries/2026-03-06-feed-category-inline-management.md`](../summaries/2026-03-06-feed-category-inline-management.md)
  - [`docs/summaries/2026-03-05-categories-settings-table-reorder.md`](../summaries/2026-03-05-categories-settings-table-reorder.md)
  - [`docs/summaries/2026-03-05-rss-feed-dialog-policy-split.md`](../summaries/2026-03-05-rss-feed-dialog-policy-split.md)
- 相关技能：
  - `@workflow-executing-plans`
  - `@workflow-using-git-worktrees`
  - `@vitest`

## 实施约束

1. 仅改 `FeedList` 及其测试，不调整 store、API、服务端事务。
2. `移动到分类` 子菜单只列出现有普通分类和 `未分类`。
3. 当前所属分类项显示但禁用。
4. 普通分类移动使用 `updateFeed(feed.id, { categoryId })`。
5. 移动到 `未分类` 使用 `updateFeed(feed.id, { categoryId: null })`。
6. 成功提示文案分别为 `已移动到「分类名」` 与 `已移动到「未分类」`。
7. 失败提示复用 `mapApiErrorToUserMessage(err, 'update-feed')`。

## 测试注意事项

1. 本项目右键菜单基于 Radix `ContextMenu`，子菜单测试优先使用：
   - `fireEvent.contextMenu(...)`
   - `fireEvent.pointerMove(subTrigger)`
   - `fireEvent.keyDown(subTrigger, { key: 'ArrowRight' })`
2. 不要依赖 `setTimeout` 或手写延时等待子菜单展开。
3. 现有 `FeedList.test.tsx` 已有 `fetch` mock 与 `snapshotResponseFromStore()`，优先复用，不要新建第二套 snapshot 逻辑。

### Task 1: 渲染 `移动到分类` 子菜单骨架

**Files:**

- Modify: `src/features/feeds/FeedList.test.tsx:471-478`
- Modify: `src/features/feeds/FeedList.test.tsx:539-718`
- Modify: `src/features/feeds/FeedList.tsx:21-28`
- Modify: `src/features/feeds/FeedList.tsx:366-410`

**Step 1: Write the failing test**

在 `src/features/feeds/FeedList.test.tsx` 增加一个只覆盖菜单结构的用例，并补一个测试辅助函数打开子菜单：

```tsx
async function openMoveToCategorySubmenu() {
  fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
  const moveTrigger = await screen.findByRole('menuitem', { name: '移动到分类' });
  fireEvent.pointerMove(moveTrigger);
  fireEvent.keyDown(moveTrigger, { key: 'ArrowRight' });
}

it('shows move-to-category submenu in category order', async () => {
  useAppStore.setState((state) => ({
    ...state,
    categories: [
      { id: 'cat-design', name: '设计', expanded: true },
      { id: 'cat-tech', name: '科技', expanded: true },
      { id: 'cat-uncategorized', name: '未分类', expanded: true },
    ],
    feeds: [
      {
        ...state.feeds[0],
        categoryId: 'cat-tech',
        category: '科技',
      },
    ],
  }));

  renderWithNotifications();
  await openMoveToCategorySubmenu();

  expect(screen.getByRole('menuitem', { name: '设计' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '科技' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: '未分类' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "shows move-to-category submenu in category order"
```

Expected: FAIL，提示无法找到名为 `移动到分类` 的 `menuitem`。

**Step 3: Write minimal implementation**

在 `src/features/feeds/FeedList.tsx`：

1. 从 `@/components/ui/context-menu` 额外引入：
   - `ContextMenuSub`
   - `ContextMenuSubTrigger`
   - `ContextMenuSubContent`
2. 在 RSS 源右键菜单的 `编辑` 后插入子菜单骨架：

```tsx
<ContextMenuSub>
  <ContextMenuSubTrigger>移动到分类</ContextMenuSubTrigger>
  <ContextMenuSubContent>
    {categoryMaster.map((category) => (
      <ContextMenuItem key={category.id}>{category.name}</ContextMenuItem>
    ))}
    <ContextMenuItem>{uncategorizedName}</ContextMenuItem>
  </ContextMenuSubContent>
</ContextMenuSub>
```

不要在这一任务里加入异步移动逻辑，只先让结构出现。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "shows move-to-category submenu in category order"
```

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "feat(feeds): 增加右键菜单分类移动入口"
```

### Task 2: 支持移动到普通分类并提示成功

**Files:**

- Modify: `src/features/feeds/FeedList.test.tsx:575-718`
- Modify: `src/features/feeds/FeedList.tsx:186-223`
- Modify: `src/features/feeds/FeedList.tsx:366-410`

**Step 1: Write the failing test**

在 `src/features/feeds/FeedList.test.tsx` 增加普通分类移动用例：

```tsx
it('moves feed to selected category from context submenu', async () => {
  useAppStore.setState((state) => ({
    ...state,
    categories: [
      { id: 'cat-design', name: '设计', expanded: true },
      { id: 'cat-tech', name: '科技', expanded: true },
      { id: 'cat-uncategorized', name: '未分类', expanded: true },
    ],
    feeds: [
      {
        ...state.feeds[0],
        categoryId: 'cat-design',
        category: '设计',
      },
    ],
  }));

  renderWithNotifications();
  await openMoveToCategorySubmenu();
  fireEvent.click(screen.getByRole('menuitem', { name: '科技' }));

  await waitFor(() => {
    expect(lastPatchBody).toEqual({ categoryId: 'cat-tech' });
  });
  expect(screen.getByText('已移动到「科技」')).toBeInTheDocument();
});
```

再补一个禁用态断言，确保当前分类项不会触发重复移动：

```tsx
expect(screen.getByRole('menuitem', { name: '设计' })).toHaveAttribute('data-disabled', '');
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "moves feed to selected category from context submenu"
```

Expected: FAIL，`lastPatchBody` 仍为 `null`，且不会出现成功提示。

**Step 3: Write minimal implementation**

在 `src/features/feeds/FeedList.tsx` 增加一个复用现有 store 的处理器：

```tsx
const moveFeedToCategory = async (
  feedId: string,
  categoryId: string | null,
  categoryName: string,
) => {
  try {
    await updateFeed(feedId, { categoryId });
    notify.success(`已移动到「${categoryName}」`);
  } catch (error) {
    notify.error(mapApiErrorToUserMessage(error, 'update-feed'));
  }
};
```

然后把普通分类项接上：

```tsx
<ContextMenuItem
  key={category.id}
  disabled={feed.categoryId === category.id}
  onSelect={() => void moveFeedToCategory(feed.id, category.id, category.name)}
>
  {category.name}
</ContextMenuItem>
```

注意：

1. 不要新增 store action。
2. 不要在本地手工调整 `feedGroups`。
3. 只依赖 `updateFeed -> loadSnapshot` 完成同步。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "moves feed to selected category from context submenu"
```

Expected: PASS。

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "feat(feeds): 支持RSS源右键移动到现有分类"
```

### Task 3: 支持移动到 `未分类` 并覆盖空分组回归

**Files:**

- Modify: `src/features/feeds/FeedList.test.tsx:636-718`
- Modify: `src/features/feeds/FeedList.tsx:186-223`
- Modify: `src/features/feeds/FeedList.tsx:366-410`

**Step 1: Write the failing test**

在 `src/features/feeds/FeedList.test.tsx` 增加两个用例。

第一个用例验证移入 `未分类`：

```tsx
it('moves feed to uncategorized from context submenu', async () => {
  useAppStore.setState((state) => ({
    ...state,
    categories: [
      { id: 'cat-tech', name: '科技', expanded: true },
      { id: 'cat-uncategorized', name: '未分类', expanded: true },
    ],
    feeds: [
      {
        ...state.feeds[0],
        categoryId: 'cat-tech',
        category: '科技',
      },
    ],
  }));

  renderWithNotifications();
  await openMoveToCategorySubmenu();
  fireEvent.click(screen.getByRole('menuitem', { name: '未分类' }));

  await waitFor(() => {
    expect(lastPatchBody).toEqual({ categoryId: null });
  });
  expect(screen.getByText('已移动到「未分类」')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '科技' })).not.toBeInTheDocument();
});
```

第二个用例验证“当前已在未分类时目标禁用”：

```tsx
it('disables uncategorized target when feed is already uncategorized', async () => {
  renderWithNotifications();
  await openMoveToCategorySubmenu();
  expect(screen.getByRole('menuitem', { name: '未分类' })).toHaveAttribute('data-disabled', '');
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "uncategorized"
```

Expected: FAIL，`lastPatchBody` 不是 `{ categoryId: null }` 或 `未分类` 项未禁用。

**Step 3: Write minimal implementation**

补齐 `未分类` 菜单项逻辑：

```tsx
<ContextMenuItem
  disabled={!feed.categoryId}
  onSelect={() => void moveFeedToCategory(feed.id, null, uncategorizedName)}
>
  {uncategorizedName}
</ContextMenuItem>
```

然后检查普通分类项禁用条件是否使用当前 feed 的实时分类 ID，而不是旧分组变量。

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx -t "uncategorized"
pnpm run test:unit -- src/features/feeds/FeedList.test.tsx
pnpm run lint
```

Expected:

- `FeedList.test.tsx` 全部 PASS
- `eslint .` 退出码为 0

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx
git commit -m "test(feeds): 覆盖右键移动未分类回归"
```

## 完成定义

1. RSS 源右键菜单出现 `移动到分类` 子菜单。
2. 子菜单按 `categoryMaster` 顺序渲染普通分类，并附加 `未分类`。
3. 当前所属分类项可见但禁用。
4. 点击普通分类后发送正确的 `categoryId` patch 并显示成功提示。
5. 点击 `未分类` 后发送 `{ categoryId: null }` 并显示成功提示。
6. 原分组被挪空时，不再出现在左栏分组中。
7. `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx` 通过。
8. `pnpm run lint` 通过。
