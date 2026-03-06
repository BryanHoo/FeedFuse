# Category Management Sidebar Entry Implementation Plan

> **For AI:** REQUIRED SUB-SKILL: Use workflow-executing-plans to implement this plan task-by-task.

**Goal:** 将分类管理主入口从设置中心迁移到左侧 `FeedList`，通过独立弹窗承接现有分类 CRUD 与排序能力，并保持现有分类消费行为不变。

**Architecture:** 复用当前分类 API 与 `useAppStore().categories` 作为唯一事实来源，不改动后端协议与 store 数据边界。前端新增 `src/features/categories/` 目录，将现有分类表格能力抽离成独立可复用组件，再由 `FeedList` 打开 `CategoryManagerDialog`。设置中心只移除 `categories` section，不继续承载分类管理。

**Tech Stack:** Next.js 16、React 19、TypeScript、Zustand、Vitest、Testing Library、shadcn/ui

---

## Prior Art / Learned Lessons

- 参考：[`docs/summaries/2026-03-05-rss-feed-dialog-policy-split.md`](../summaries/2026-03-05-rss-feed-dialog-policy-split.md)
  - 继续保持“设置职责收敛”，不要把业务数据管理留在 settings 容器里。
  - 高频业务配置应靠近主流程入口，不要强迫用户穿过设置中心。
- 参考：[`docs/summaries/2026-03-05-categories-settings-table-reorder.md`](../summaries/2026-03-05-categories-settings-table-reorder.md)
  - 现有分类表格交互与 reorder 链路已稳定，迁移入口时优先复用，不要重写一套。
  - `FeedList` 与 `AddFeedDialog` 的顺序一致性已经建立，实施时不能引入第二套分类状态。
- 设计文档：[`docs/plans/2026-03-06-category-management-sidebar-entry-design.md`](./2026-03-06-category-management-sidebar-entry-design.md)

## Constraints / Implementation Rules

1. 只解决入口迁移与容器拆分，不改造分类 API、数据库结构或 `appStore` 数据模型。
2. `未分类` 继续是系统保底项，不可编辑、不可排序。
3. 不在同一改动中清理 `PersistedSettings.categories` 历史字段，避免扩大变更面。
4. 按 TDD 执行，每个任务先写失败测试，再写最小实现。
5. 小步提交，建议每个任务一个 commit。
6. 相关技能：@vitest @shadcn-ui @vercel-react-best-practices @workflow-verification-before-completion

### Task 1: 抽离独立分类管理组件

**Files:**

- Create: `src/features/categories/CategoryManagerDialog.tsx`
- Create: `src/features/categories/CategoryManagerPanel.tsx`
- Create: `src/features/categories/CategoryManagerPanel.test.tsx`
- Modify: `src/features/settings/panels/CategoriesSettingsPanel.tsx`
- Modify: `src/features/settings/panels/CategoriesSettingsPanel.test.tsx`

**Step 1: Write the failing test**

```tsx
// src/features/categories/CategoryManagerPanel.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotificationProvider } from '../notifications/NotificationProvider';
import CategoryManagerPanel from './CategoryManagerPanel';

it('supports create rename delete and reorder from the standalone categories feature', async () => {
  render(
    <NotificationProvider>
      <CategoryManagerPanel />
    </NotificationProvider>,
  );

  fireEvent.change(screen.getByLabelText('新分类名称'), { target: { value: 'Tech' } });
  fireEvent.click(screen.getByRole('button', { name: '添加分类' }));

  await waitFor(() => {
    expect(screen.getByRole('table', { name: '分类管理表格' })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/categories/CategoryManagerPanel.test.tsx`
Expected: FAIL with module not found for `./CategoryManagerPanel`.

**Step 3: Write minimal implementation**

```tsx
// src/features/categories/CategoryManagerPanel.tsx
export default function CategoryManagerPanel() {
  return (
    <div className="space-y-4">
      {/* 先迁移现有 CategoriesSettingsPanel 的表格 CRUD 与 reorder 逻辑 */}
    </div>
  );
}

// src/features/settings/panels/CategoriesSettingsPanel.tsx
export { default } from '../../categories/CategoryManagerPanel';
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/categories/CategoryManagerPanel.test.tsx src/features/settings/panels/CategoriesSettingsPanel.test.tsx`
Expected: PASS，且旧测试仍能通过。

**Step 5: Commit**

```bash
git add src/features/categories/CategoryManagerDialog.tsx src/features/categories/CategoryManagerPanel.tsx src/features/categories/CategoryManagerPanel.test.tsx src/features/settings/panels/CategoriesSettingsPanel.tsx src/features/settings/panels/CategoriesSettingsPanel.test.tsx
git commit -m "refactor(categories): 抽离独立分类管理组件"
```

### Task 2: 在 `FeedList` 接入分类管理入口与弹窗

**Files:**

- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`
- Modify: `src/features/categories/CategoryManagerDialog.tsx`

**Step 1: Write the failing test**

```tsx
it('opens category manager dialog from the feed sidebar', async () => {
  renderWithNotifications();

  fireEvent.click(screen.getByRole('button', { name: '管理分类' }));

  await waitFor(() => {
    expect(screen.getByRole('dialog', { name: '分类管理' })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx`
Expected: FAIL because `管理分类` button does not exist.

**Step 3: Write minimal implementation**

```tsx
// src/features/feeds/FeedList.tsx
const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);

<Button
  type="button"
  variant="ghost"
  size="sm"
  aria-label="open-category-manager"
  onClick={() => setCategoryManagerOpen(true)}
>
  管理分类
</Button>

<CategoryManagerDialog
  open={categoryManagerOpen}
  onOpenChange={setCategoryManagerOpen}
/>
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/feeds/FeedList.test.tsx src/features/categories/CategoryManagerPanel.test.tsx`
Expected: PASS，且不影响现有 feed 编辑/删除/策略菜单测试。

**Step 5: Commit**

```bash
git add src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx src/features/categories/CategoryManagerDialog.tsx
git commit -m "feat(feeds): 在左栏接入分类管理弹窗"
```

### Task 3: 移除设置中心中的分类分区

**Files:**

- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
- Modify: `src/features/settings/SettingsCenterModal.test.tsx`
- Modify: `src/features/settings/SettingsCenterModal.tsx`

**Step 1: Write the failing test**

```tsx
it('does not render categories tab in settings anymore', async () => {
  resetSettingsStore();
  renderWithNotifications();

  fireEvent.click(screen.getByLabelText('open-settings'));

  await waitFor(() => {
    expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
  });

  expect(screen.queryByTestId('settings-section-tab-categories')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm run test:unit -- src/features/settings/SettingsCenterModal.test.tsx`
Expected: FAIL because `settings-section-tab-categories` still exists.

**Step 3: Write minimal implementation**

```tsx
// src/features/settings/SettingsCenterDrawer.tsx
type SettingsSectionKey = 'general' | 'rss' | 'ai';

const sectionItems = [
  { key: 'general', label: '通用', hint: '主题与行为', icon: Palette },
  { key: 'rss', label: 'RSS', hint: '抓取间隔', icon: Rss },
  { key: 'ai', label: 'AI', hint: '模型与密钥', icon: Bot },
];

const sectionErrors = {
  general: ...,
  rss: ...,
  ai: ...,
};
```

**Step 4: Run test to verify it passes**

Run: `pnpm run test:unit -- src/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS，且现有 settings autosave/AI/RSS 相关用例继续通过。

**Step 5: Commit**

```bash
git add src/features/settings/SettingsCenterDrawer.tsx src/features/settings/SettingsCenterModal.test.tsx src/features/settings/SettingsCenterModal.tsx
git commit -m "refactor(settings): 移除分类设置分区"
```

### Task 4: 回归验证分类消费链路与旧入口清理

**Files:**

- Modify: `src/features/feeds/FeedDialog.tsx`
- Modify: `src/features/feeds/AddFeedDialog.test.tsx`
- Modify: `src/features/feeds/FeedList.test.tsx`
- Delete: `src/features/settings/panels/CategoriesSettingsPanel.tsx`（若 Task 1 已完全迁移且无引用）
- Delete: `src/features/settings/panels/CategoriesSettingsPanel.test.tsx`（若 Task 1 已完全迁移且无引用）

**Step 1: Write the failing regression tests**

```tsx
it('keeps category option order in add feed dialog after entry migration', async () => {
  // 断言 AddFeedDialog 下拉顺序仍为 store 顺序
});

it('keeps uncategorized fallback semantics after deleting a category', async () => {
  // 断言删除分类后，feed.categoryId 仍回到 null / 未分类
});
```

**Step 2: Run test to verify current behavior and expose any regressions**

Run: `pnpm run test:unit -- src/features/feeds/AddFeedDialog.test.tsx src/features/feeds/FeedList.test.tsx`
Expected: PASS，若因组件迁移引入回归则在这里暴露。

**Step 3: Write minimal implementation / cleanup**

```tsx
// 仅在有必要时调整 FeedDialog 的 category options 构造；若行为未变则不改实现。
// 删除旧 settings 面板壳层文件，确保分类管理只存在于 features/categories。
```

**Step 4: Run scoped verification**

Run: `pnpm run test:unit -- src/features/categories/CategoryManagerPanel.test.tsx src/features/feeds/FeedList.test.tsx src/features/feeds/AddFeedDialog.test.tsx src/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS.

Run: `pnpm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/categories src/features/feeds/FeedList.tsx src/features/feeds/FeedList.test.tsx src/features/feeds/FeedDialog.tsx src/features/feeds/AddFeedDialog.test.tsx src/features/settings/SettingsCenterDrawer.tsx src/features/settings/SettingsCenterModal.test.tsx
git commit -m "test(categories): 补齐分类入口迁移回归"
```

### Task 5: 最终验证与文档收尾

**Files:**

- Create: `docs/summaries/YYYY-MM-DD-category-management-sidebar-entry.md`
- Modify: `docs/plans/2026-03-06-category-management-sidebar-entry-implementation-plan.md`

**Step 1: Run final verification**

Run: `pnpm run test:unit`
Expected: PASS.

Run: `pnpm run lint`
Expected: PASS.

**Step 2: Record implementation summary**

```md
# 分类管理侧边栏入口迁移总结

- 入口从设置中心迁移到 `FeedList`
- 分类 CRUD 与 reorder 继续复用原 API
- 设置中心职责收敛，不再承载分类管理
```

**Step 3: Commit summary docs**

```bash
git add docs/summaries/YYYY-MM-DD-category-management-sidebar-entry.md
git commit -m "docs(summary): 记录分类入口迁移实现与验证结果"
```
