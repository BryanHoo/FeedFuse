# Categories Settings Table Reorder Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 将分类设置面板改造成 `shadcn/ui` 风格表格，并支持拖拽排序持久化，且排序结果同步影响 `FeedList` 分组顺序与 `AddFeedDialog` 分类下拉顺序。

**Architecture:** 以后端 `categories.position` 作为唯一排序事实来源，新增批量重排 API（`PATCH /api/categories/reorder`）做原子更新。前端 `CategoriesSettingsPanel` 在拖拽完成后先乐观更新，再调用批量 API 持久化；失败时回滚并重新拉取分类。`FeedList` 和 `AddFeedDialog` 继续消费 `useAppStore().categories` 顺序，避免额外状态分叉。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zustand、Vitest、Testing Library、shadcn/ui

---

## Prior Art / Learned Lessons

- 参考：`docs/summaries/2026-03-05-rss-feed-dialog-policy-split.md`
  - 继续保持“设置职责收敛”，只改分类管理，不混入无关配置。
  - 延续“自动保存 + 可视化通知”交互，不引入额外保存按钮。

## 约束与实施原则

1. 仅实现本次需求：分类表格化 + 拖拽排序 + 批量持久化。
2. 遵循 DRY/YAGNI：不引入批量删除、筛选、分页。
3. 按 TDD 执行：每个任务都先写失败测试，再写最小实现。
4. 小步提交：每个任务完成后单独 commit。
5. 相关技能：@shadcn-ui @vitest @workflow-verification-before-completion

### Task 1: 新增分类批量重排 Repository 能力

**Files:**

- Create: `src/server/repositories/categoriesRepo.test.ts`
- Modify: `src/server/repositories/categoriesRepo.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { reorderCategories } from './categoriesRepo';

describe('reorderCategories', () => {
  it('updates positions in a transaction and returns sorted rows', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce(undefined) // begin
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }, { id: 'c2' }] }) // existence check
      .mockResolvedValueOnce(undefined) // bulk update
      .mockResolvedValueOnce({
        rows: [
          { id: 'c2', name: '设计', position: 0 },
          { id: 'c1', name: '科技', position: 1 },
        ],
      }) // select
      .mockResolvedValueOnce(undefined); // commit

    const pool = { query } as unknown as Pool;

    const rows = await reorderCategories(pool, [
      { id: 'c2', position: 0 },
      { id: 'c1', position: 1 },
    ]);

    expect(rows.map((x) => x.id)).toEqual(['c2', 'c1']);
    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(query).toHaveBeenLastCalledWith('commit');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/server/repositories/categoriesRepo.test.ts`
Expected: FAIL with `reorderCategories is not a function` or import error.

**Step 3: Write minimal implementation**

```ts
// src/server/repositories/categoriesRepo.ts
export async function reorderCategories(
  pool: Pool,
  items: Array<{ id: string; position: number }>,
): Promise<CategoryRow[]> {
  await pool.query('begin');
  try {
    const ids = items.map((item) => item.id);
    const positions = items.map((item) => item.position);

    const existing = await pool.query<{ id: string }>(
      'select id from categories where id = any($1::uuid[])',
      [ids],
    );
    if (existing.rows.length !== ids.length) {
      throw new Error('category_not_found');
    }

    await pool.query(
      `
      update categories as c
      set position = v.position,
          updated_at = now()
      from (
        select unnest($1::uuid[]) as id, unnest($2::int[]) as position
      ) as v
      where c.id = v.id
      `,
      [ids, positions],
    );

    const result = await pool.query<CategoryRow>(
      'select id, name, position from categories order by position asc, name asc',
    );

    await pool.query('commit');
    return result.rows;
  } catch (err) {
    await pool.query('rollback');
    throw err;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/server/repositories/categoriesRepo.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/repositories/categoriesRepo.ts src/server/repositories/categoriesRepo.test.ts
git commit -m "feat(categories): 增加分类批量重排仓储能力"
```

### Task 2: 新增 `PATCH /api/categories/reorder` 路由与校验

**Files:**

- Create: `src/app/api/categories/reorder/route.ts`
- Modify: `src/app/api/categories/routes.test.ts`

**Step 1: Write the failing test**

```ts
it('PATCH /api/categories/reorder updates positions', async () => {
  reorderCategoriesMock.mockResolvedValue([
    { id: 'c2', name: '设计', position: 0 },
    { id: 'c1', name: '科技', position: 1 },
  ]);

  const mod = await import('./reorder/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/categories/reorder', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: '00000000-0000-0000-0000-000000000002', position: 0 },
          { id: '00000000-0000-0000-0000-000000000001', position: 1 },
        ],
      }),
    }),
  );

  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.data[0].position).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/app/api/categories/routes.test.ts`
Expected: FAIL with module not found for `./reorder/route`.

**Step 3: Write minimal implementation**

```ts
// src/app/api/categories/reorder/route.ts
const reorderBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

export async function PATCH(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = reorderBodySchema.safeParse(json);
  if (!parsed.success) {
    return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
  }

  const ids = parsed.data.items.map((item) => item.id);
  const positions = parsed.data.items.map((item) => item.position);
  if (new Set(ids).size !== ids.length || new Set(positions).size !== positions.length) {
    return fail(new ValidationError('Duplicate ids or positions', { items: 'duplicate' }));
  }

  const sorted = [...positions].sort((a, b) => a - b);
  if (!sorted.every((value, index) => value === index)) {
    return fail(new ValidationError('Positions must be contiguous from 0', { items: 'non_contiguous' }));
  }

  const pool = getPool();
  const rows = await reorderCategories(pool, parsed.data.items);
  return ok(rows);
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/app/api/categories/routes.test.ts`
Expected: PASS (包含新 route 用例)。

**Step 5: Commit**

```bash
git add src/app/api/categories/reorder/route.ts src/app/api/categories/routes.test.ts
git commit -m "feat(api): 新增分类批量重排接口"
```

### Task 3: 客户端增加批量重排 API 能力

**Files:**

- Modify: `src/lib/apiClient.ts`
- Modify: `src/features/settings/panels/CategoriesSettingsPanel.test.tsx`

**Step 1: Write the failing test**

```ts
it('calls reorder api after drag reorder', async () => {
  renderWithNotifications();

  fireEvent.dragStart(screen.getByLabelText('排序手柄-0'));
  fireEvent.dragEnter(screen.getByLabelText('排序手柄-1'));
  fireEvent.drop(screen.getByLabelText('排序手柄-1'));

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/categories/reorder'),
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
Expected: FAIL because panel 没有拖拽触发 + client 无 reorder API。

**Step 3: Write minimal implementation**

```ts
// src/lib/apiClient.ts
export async function reorderCategories(
  items: Array<{ id: string; position: number }>,
): Promise<CategoryDto[]> {
  return requestApi('/api/categories/reorder', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
```

```ts
// CategoriesSettingsPanel.tsx (先接线，UI 在 Task 4 完整重构)
await reorderCategories(nextOrder.map((item, index) => ({ id: item.id, position: index })));
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
Expected: PASS 新增的 reorder 请求断言。

**Step 5: Commit**

```bash
git add src/lib/apiClient.ts src/features/settings/panels/CategoriesSettingsPanel.test.tsx src/features/settings/panels/CategoriesSettingsPanel.tsx
git commit -m "feat(settings): 接入分类重排客户端请求"
```

### Task 4: `CategoriesSettingsPanel` 改造为表格 + 拖拽排序

**Files:**

- Create: `src/components/ui/table.tsx`
- Modify: `src/features/settings/panels/CategoriesSettingsPanel.tsx`
- Modify: `src/features/settings/panels/CategoriesSettingsPanel.test.tsx`

**Step 1: Write the failing test**

```ts
it('renders categories as table rows', () => {
  renderWithNotifications();

  expect(screen.getByRole('table', { name: '分类管理表格' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '排序' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '分类名称' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '订阅源数量' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: '操作' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
Expected: FAIL with table role/header assertions not found.

**Step 3: Write minimal implementation**

```tsx
// src/components/ui/table.tsx (shadcn table 基础组件)
export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(...)
export const TableHeader = ...
export const TableBody = ...
export const TableRow = ...
export const TableHead = ...
export const TableCell = ...
```

```tsx
// CategoriesSettingsPanel.tsx 核心渲染
<Table aria-label="分类管理表格">
  <TableHeader>
    <TableRow>
      <TableHead>排序</TableHead>
      <TableHead>分类名称</TableHead>
      <TableHead>订阅源数量</TableHead>
      <TableHead className="text-right">操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {categories.map((category, index) => (
      <TableRow key={category.id} draggable onDragStart={...} onDrop={...}>
        <TableCell>
          <button aria-label={`排序手柄-${index}`}>⋮⋮</button>
        </TableCell>
        <TableCell>
          <Input aria-label={`分类名称-${index}`} ... />
        </TableCell>
        <TableCell>
          <Badge ...>{feedCount}</Badge>
        </TableCell>
        <TableCell>
          <Button aria-label={`删除分类-${index}`} ... />
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
Expected: PASS（保留原 CRUD 测试 + 新表格/拖拽断言）。

**Step 5: Commit**

```bash
git add src/components/ui/table.tsx src/features/settings/panels/CategoriesSettingsPanel.tsx src/features/settings/panels/CategoriesSettingsPanel.test.tsx
git commit -m "refactor(settings): 分类面板改为表格并支持拖拽排序"
```

### Task 5: 确认排序结果在 `FeedList` 与 `AddFeedDialog` 一致消费

**Files:**

- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`
- Modify: `src/features/feeds/AddFeedDialog.test.tsx`

**Step 1: Write the failing test**

```ts
// FeedList.test.tsx
it('renders category groups by category order from store', () => {
  useAppStore.setState({
    categories: [
      { id: 'cat-design', name: '设计', expanded: true },
      { id: 'cat-tech', name: '科技', expanded: true },
      { id: 'cat-uncategorized', name: '未分类', expanded: true },
    ],
    feeds: [
      { id: 'f1', title: 'A', categoryId: 'cat-tech', ... },
      { id: 'f2', title: 'B', categoryId: 'cat-design', ... },
    ],
  });

  renderWithNotifications();

  const headers = screen.getAllByRole('button', { name: /设计|科技|未分类/ });
  expect(headers.map((x) => x.textContent)).toEqual(['设计', '科技']);
});
```

```ts
// AddFeedDialog.test.tsx
it('shows category options in store order', async () => {
  renderWithNotifications();
  fireEvent.click(screen.getByLabelText('add-feed'));
  fireEvent.click(screen.getByRole('combobox', { name: '分类' }));

  const options = screen.getAllByRole('option');
  expect(options.map((x) => x.textContent)).toEqual(['未分类', '设计', '科技']);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx src/features/feeds/AddFeedDialog.test.tsx`
Expected: 至少一项 FAIL（顺序断言不稳定或未明确约束）。

**Step 3: Write minimal implementation**

```ts
// FeedList.tsx
// 保持按 appCategories 当前顺序构建 categoryMaster，不额外按 name 排序。
const categoryMaster = useMemo(
  () => appCategories.filter((x) => x.id !== uncategorizedId && x.name !== uncategorizedName),
  [appCategories],
);
```

```ts
// 若 AddFeedDialog 测试暴露排序漂移
// 在生成 categories props 的调用点保持 store 原序透传，不做额外 sort。
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx src/features/feeds/AddFeedDialog.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx src/features/feeds/AddFeedDialog.test.tsx
git commit -m "test(feeds): 补齐分类顺序消费一致性回归"
```

### Task 6: 全量回归与完成验证

**Files:**

- Modify: `docs/summaries/2026-03-05-categories-settings-table-reorder.md`（新增总结）

**Step 1: Write verification checklist as failing guard**

```md
- [ ] categories panel supports create/rename/delete/reorder
- [ ] reorder persists after reload
- [ ] FeedList order matches category positions
- [ ] AddFeedDialog order matches category positions
- [ ] unit tests green
- [ ] lint green
```

**Step 2: Run scoped tests before full suite**

Run:
`pnpm run test:unit -- src/features/settings/panels/CategoriesSettingsPanel.test.tsx src/app/api/categories/routes.test.ts src/features/feeds/FeedList.test.tsx src/features/feeds/AddFeedDialog.test.tsx src/server/repositories/categoriesRepo.test.ts`
Expected: PASS.

**Step 3: Run lint and full confidence checks**

Run:
`pnpm run lint`

Run:
`pnpm run test:unit`

Expected: PASS（若全量过慢，至少确保与改动相关测试和 lint 通过，并记录未跑范围）。

**Step 4: Write summary doc**

```md
# 分类设置表格排序改造总结
- 背景
- 关键改动
- 验证命令与结果
- 风险与后续建议
```

**Step 5: Commit**

```bash
git add docs/summaries/2026-03-05-categories-settings-table-reorder.md
git commit -m "docs(summary): 记录分类表格排序改造与验证结果"
```
