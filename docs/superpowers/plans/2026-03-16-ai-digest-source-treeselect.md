# AI 解读来源 TreeSelect 改造 Implementation Plan

> **For agentic workers:** REQUIRED: Use workflow-subagent-driven-development (if subagents available) or workflow-executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `Add AI解读` 弹窗的“来源”从双列表 checkbox 改为 `rc-tree-select` 树形多选，只提交 `selectedFeedIds`，并让后端严格拒绝 `selectedCategoryIds`。

**Architecture:** 前端新增 `AiDigestSourceTreeSelect` 封装树数据、联动选择、单行标签折叠展示，并在 `AiDigestDialogForm`/`useAiDigestDialogForm` 中替换旧来源字段。后端收紧 `POST /api/ai-digests` 契约（严格对象 + 无 `selectedCategoryIds`），服务层与 worker 统一只基于 `selected_feed_ids` 运行。数据库保留历史列但不再写入/读取分类来源语义。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + Zustand + Zod + Vitest + Testing Library + `rc-tree-select`

---

## Context Snapshot

- Approved spec: `docs/superpowers/specs/2026-03-16-ai-digest-source-treeselect-design.md`
- Relevant existing implementation:
  - `src/features/feeds/AiDigestDialogForm.tsx`
  - `src/features/feeds/useAiDigestDialogForm.ts`
  - `src/app/api/ai-digests/route.ts`
  - `src/server/services/aiDigestLifecycleService.ts`
  - `src/server/repositories/aiDigestRepo.ts`
  - `src/worker/aiDigestGenerate.ts`
- Relevant summary constraints (`docs/summaries/2026-03-11-accessible-name-token-leak.md`):
  - 不要把内部 token（如 `close-*`）暴露到 `aria-label`/`closeLabel`。
  - 可访问名称必须是用户语义文案，不能依赖 `title` 或视觉上下文兜底。

## Scope Guardrails

- 只做来源选择链路改造，不改 AI 解读生成算法、数据库结构迁移和 Reader 主流程。
- `selected_category_ids` 列保留（历史兼容字段），但新路径不再写入也不再参与运行时解析。
- 不引入 `antd`，只引入 `rc-tree-select`。

## File Structure Plan

Planned creates:
- `src/features/feeds/aiDigestSourceTree.utils.ts` - 树数据构建、值归一化、标签容量计算纯函数
- `src/features/feeds/aiDigestSourceTree.utils.test.ts` - 纯函数单测
- `src/features/feeds/AiDigestSourceTreeSelect.tsx` - `rc-tree-select` UI 封装
- `src/features/feeds/AiDigestSourceTreeSelect.test.tsx` - 组件行为单测（含 props 映射）
- `src/features/feeds/AiDigestSourceTreeSelect.module.css` - 局部样式覆盖（输入框/下拉/树节点/tag）
- `src/features/feeds/useAiDigestDialogForm.test.tsx` - 表单提交 payload 单测

Planned modifies:
- `package.json`
- `pnpm-lock.yaml`
- `src/app/globals.css`
- `src/features/feeds/AiDigestDialogForm.tsx`
- `src/features/feeds/AiDigestDialog.tsx`
- `src/features/feeds/useAiDigestDialogForm.ts`
- `src/features/feeds/AddAiDigestDialog.test.tsx`
- `src/store/appStore.ts`
- `src/lib/apiClient.ts`
- `src/app/api/ai-digests/route.ts`
- `src/app/api/ai-digests/routes.test.ts`
- `src/server/services/aiDigestLifecycleService.ts`
- `src/server/services/aiDigestLifecycleService.test.ts`
- `src/server/repositories/aiDigestRepo.ts`
- `src/worker/aiDigestGenerate.ts`
- `src/worker/aiDigestGenerate.test.ts`

Skills reference for implementers:
- `@vitest`
- `@nodejs-best-practices`
- `@vercel-react-best-practices`

## Chunk 1: 前端来源树组件与表单集成

### Task 1: 引入依赖并建立来源树纯函数（TDD）

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/features/feeds/aiDigestSourceTree.utils.ts`
- Test: `src/features/feeds/aiDigestSourceTree.utils.test.ts`

- [ ] **Step 1: 安装依赖**

Run: `pnpm add rc-tree-select`

Expected: `dependencies` 新增 `rc-tree-select`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 先写失败测试（树数据与值归一化）**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildAiDigestSourceTreeData,
  collectSelectedFeedIds,
  computeVisibleTagCount,
} from './aiDigestSourceTree.utils';

describe('aiDigestSourceTree.utils', () => {
  it('filters ai_digest feeds and hides empty categories', () => {
    const result = buildAiDigestSourceTreeData({
      categories: [
        { id: 'cat-tech', name: '科技' },
        { id: 'cat-empty', name: '空分类' },
      ],
      feeds: [
        { id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' },
        { id: 'digest-1', kind: 'ai_digest', title: 'Digest', categoryId: 'cat-tech' },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('category:cat-tech');
    expect(result[0]?.children?.map((n) => n.value)).toEqual(['feed:rss-1']);
  });

  it('collects feed ids only and deduplicates stably', () => {
    expect(collectSelectedFeedIds(['category:cat-tech', 'feed:rss-2', 'feed:rss-2', 'feed:rss-1']))
      .toEqual(['rss-1', 'rss-2']);
  });

  it('computes single-line visible tag count', () => {
    expect(computeVisibleTagCount({ containerWidth: 360, tagWidth: 112, gap: 8, suffixWidth: 56 }))
      .toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test:unit src/features/feeds/aiDigestSourceTree.utils.test.ts`

Expected: FAIL（缺少 `aiDigestSourceTree.utils.ts` 导出）。

- [ ] **Step 4: 实现最小纯函数**

```ts
// src/features/feeds/aiDigestSourceTree.utils.ts
import type { Category, Feed } from '../../types';

export type SourceTreeNode = {
  title: string;
  value: string;
  key: string;
  children?: SourceTreeNode[];
  selectable?: boolean;
  disableCheckbox?: boolean;
};

export function buildAiDigestSourceTreeData(input: {
  categories: Category[];
  feeds: Feed[];
}): SourceTreeNode[] {
  // 仅保留 rss，并按分类聚合；空分类不返回
}

export function collectSelectedFeedIds(values: Array<string | number>): string[] {
  // 只提取 feed: 前缀并去重 + 稳定排序
}

export function computeVisibleTagCount(input: {
  containerWidth: number;
  tagWidth: number;
  gap: number;
  suffixWidth: number;
}): number {
  // 至少返回 1，保证极窄宽度也可见一个标签
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm test:unit src/features/feeds/aiDigestSourceTree.utils.test.ts`

Expected: PASS（3 tests passed）。

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml src/features/feeds/aiDigestSourceTree.utils.ts src/features/feeds/aiDigestSourceTree.utils.test.ts
git commit -m "feat(feeds): 添加AI解读来源树数据工具函数" \
  -m "- 引入 rc-tree-select 依赖用于树形多选交互" \
  -m "- 实现来源树构建与仅RSS叶子值归一化能力"
```

### Task 2: 实现 `AiDigestSourceTreeSelect` 组件（TDD）

**Files:**

- Create: `src/features/feeds/AiDigestSourceTreeSelect.tsx`
- Create: `src/features/feeds/AiDigestSourceTreeSelect.test.tsx`
- Create: `src/features/feeds/AiDigestSourceTreeSelect.module.css`
- Modify: `src/app/globals.css`

- [ ] **Step 1: 先写失败测试（组件对外行为）**

```ts
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiDigestSourceTreeSelect from './AiDigestSourceTreeSelect';

vi.mock('rc-tree-select', () => ({
  default: (props: any) => (
    <button
      type="button"
      onClick={() => props.onChange(['category:cat-tech', 'feed:rss-2', 'feed:rss-1'])}
    >
      trigger-tree
    </button>
  ),
  SHOW_CHILD: 'SHOW_CHILD',
}));

describe('AiDigestSourceTreeSelect', () => {
  it('emits feed ids only', () => {
    const onChange = vi.fn();
    render(
      <AiDigestSourceTreeSelect
        categories={[{ id: 'cat-tech', name: '科技' }]}
        feeds={[
          { id: 'rss-1', kind: 'rss', title: 'RSS 1', categoryId: 'cat-tech' } as any,
          { id: 'rss-2', kind: 'rss', title: 'RSS 2', categoryId: 'cat-tech' } as any,
          { id: 'digest-1', kind: 'ai_digest', title: 'Digest', categoryId: 'cat-tech' } as any,
        ]}
        selectedFeedIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'trigger-tree' }));
    expect(onChange).toHaveBeenCalledWith(['rss-1', 'rss-2']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit src/features/feeds/AiDigestSourceTreeSelect.test.tsx`

Expected: FAIL（缺少组件文件）。

- [ ] **Step 3: 实现组件与样式**

```tsx
// src/features/feeds/AiDigestSourceTreeSelect.tsx
'use client';

import TreeSelect from 'rc-tree-select';
import { useMemo, useRef, useState } from 'react';
import { buildAiDigestSourceTreeData, collectSelectedFeedIds, computeVisibleTagCount } from './aiDigestSourceTree.utils';
import styles from './AiDigestSourceTreeSelect.module.css';

export default function AiDigestSourceTreeSelect(props: Props) {
  // 1) treeData: 分类->RSS，过滤 ai_digest，隐藏空分类
  // 2) value: selectedFeedIds -> feed: 前缀
  // 3) onChange: 输出 selectedFeedIds
  // 4) maxTagCount + maxTagPlaceholder => ...(+N)
}
```

```css
/* src/features/feeds/AiDigestSourceTreeSelect.module.css */
.root {
  width: 100%;
}

.root :global(.rc-tree-select-selector) {
  min-height: 2.5rem;
  border-radius: 0.5rem;
}

.root :global(.rc-tree-select-selection-overflow) {
  flex-wrap: nowrap;
}

.root :global(.rc-tree-select-selection-item) {
  max-width: 112px;
}
```

```css
/* src/app/globals.css (保持首行 @import "tailwindcss"; 不变，在其后新增) */
@import "rc-tree-select/assets/index.css";
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit src/features/feeds/AiDigestSourceTreeSelect.test.tsx src/features/feeds/aiDigestSourceTree.utils.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/feeds/AiDigestSourceTreeSelect.tsx src/features/feeds/AiDigestSourceTreeSelect.test.tsx src/features/feeds/AiDigestSourceTreeSelect.module.css src/app/globals.css
git commit -m "feat(feeds): 添加AI解读来源TreeSelect组件" \
  -m "- 封装 rc-tree-select 并实现分类联动勾选行为" \
  -m "- 支持单行固定宽度标签与 ...(+N) 溢出展示"
```

### Task 3: 集成弹窗表单、状态与客户端类型（TDD）

**Files:**

- Modify: `src/features/feeds/AiDigestDialogForm.tsx`
- Modify: `src/features/feeds/AiDigestDialog.tsx`
- Modify: `src/features/feeds/useAiDigestDialogForm.ts`
- Create: `src/features/feeds/useAiDigestDialogForm.test.tsx`
- Modify: `src/features/feeds/AddAiDigestDialog.test.tsx`
- Modify: `src/store/appStore.ts`
- Modify: `src/lib/apiClient.ts`

- [ ] **Step 1: 先写失败测试（提交 payload 仅含 `selectedFeedIds`）**

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAiDigestDialogForm } from './useAiDigestDialogForm';

const addAiDigestMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../../store/appStore', () => ({
  useAppStore: (selector: any) => selector({ addAiDigest: addAiDigestMock }),
}));

it('submits selectedFeedIds only', async () => {
  const { result } = renderHook(() =>
    useAiDigestDialogForm({
      categories: [{ id: 'cat-tech', name: '科技', expanded: true }],
      feeds: [{ id: 'rss-1', kind: 'rss', title: 'RSS 1' } as any],
      onOpenChange: vi.fn(),
    }),
  );

  act(() => {
    result.current.setTitle('日报');
    result.current.setPrompt('请解读');
    result.current.setSelectedFeedIds(['rss-1']);
  });

  await act(async () => {
    await result.current.handleSubmit({ preventDefault() {} } as any);
  });

  expect(addAiDigestMock).toHaveBeenCalledWith(
    expect.objectContaining({ selectedFeedIds: ['rss-1'] }),
  );
  expect(addAiDigestMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ selectedCategoryIds: expect.anything() }),
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit src/features/feeds/useAiDigestDialogForm.test.tsx`

Expected: FAIL（hook 暴露与 payload 结构不匹配）。

- [ ] **Step 3: 最小实现前端集成**

```tsx
// AiDigestDialogForm.tsx
<Label className="text-xs">来源</Label>
<AiDigestSourceTreeSelect
  categories={sourceCategoryOptions}
  feeds={sourceFeedOptions}
  selectedFeedIds={selectedFeedIds}
  onChange={onSelectedFeedIdsChange}
  error={sourcesFieldError}
/>
```

```ts
// useAiDigestDialogForm.ts
const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
const hasSources = selectedFeedIds.length > 0;

await addAiDigest({
  title: trimmedTitle,
  prompt: trimmedPrompt,
  intervalMinutes,
  selectedFeedIds,
  ...categoryPayload,
});
```

```ts
// appStore.ts / apiClient.ts
addAiDigest: (payload: { ...; selectedFeedIds: string[]; /* no selectedCategoryIds */ }) => Promise<void>
createAiDigest(input: { ...; selectedFeedIds: string[]; /* no selectedCategoryIds */ })
```

并同步修复可访问性：

```tsx
// AiDigestDialog.tsx
<DialogContent closeLabel="关闭添加AI解读源" ... />
```

- [ ] **Step 4: 运行测试确认通过**

Run:
- `pnpm test:unit src/features/feeds/useAiDigestDialogForm.test.tsx`
- `pnpm test:unit src/features/feeds/AddAiDigestDialog.test.tsx`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/features/feeds/AiDigestDialogForm.tsx src/features/feeds/AiDigestDialog.tsx src/features/feeds/useAiDigestDialogForm.ts src/features/feeds/useAiDigestDialogForm.test.tsx src/features/feeds/AddAiDigestDialog.test.tsx src/store/appStore.ts src/lib/apiClient.ts
git commit -m "refactor(feeds): 收敛AI解读来源提交流程到RSS源" \
  -m "- 在弹窗中接入 TreeSelect 并移除 selectedCategoryIds 状态" \
  -m "- 统一客户端类型与提交载荷仅保留 selectedFeedIds"
```

## Chunk 2: 后端契约收紧与运行时行为收敛

### Task 4: 收紧 `/api/ai-digests` 契约并补测试（TDD）

**Files:**

- Modify: `src/app/api/ai-digests/route.ts`
- Modify: `src/app/api/ai-digests/routes.test.ts`

- [ ] **Step 1: 先写失败测试（拒绝 `selectedCategoryIds`）**

```ts
it('POST rejects selectedCategoryIds', async () => {
  const mod = await import('./route');
  const res = await mod.POST(
    new Request('http://localhost/api/ai-digests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'My Digest',
        prompt: '解读这些文章',
        intervalMinutes: 60,
        selectedFeedIds: ['22222222-2222-2222-8222-222222222222'],
        selectedCategoryIds: [],
      }),
    }),
  );
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit src/app/api/ai-digests/routes.test.ts`

Expected: FAIL（当前 route 仍接收 `selectedCategoryIds`）。

- [ ] **Step 3: 最小实现（严格对象 + 明确字段错误）**

```ts
const bodySchema = z.strictObject({
  title: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  intervalMinutes: z.number().int(),
  selectedFeedIds: z.array(z.string().uuid()).min(1),
  ...categoryInputShape,
});

if (json && typeof json === 'object' && 'selectedCategoryIds' in (json as Record<string, unknown>)) {
  return fail(new ValidationError('Invalid request body', {
    selectedCategoryIds: 'selectedCategoryIds is not allowed',
  }));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit src/app/api/ai-digests/routes.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/api/ai-digests/route.ts src/app/api/ai-digests/routes.test.ts
git commit -m "fix(api): 收紧AI解读创建接口来源字段契约" \
  -m "- 使用严格对象校验并要求 selectedFeedIds 非空" \
  -m "- 显式拒绝 selectedCategoryIds 以避免隐式兼容"
```

### Task 5: 收敛 service/repo 写入类型（TDD）

**Files:**

- Modify: `src/server/services/aiDigestLifecycleService.ts`
- Modify: `src/server/services/aiDigestLifecycleService.test.ts`
- Modify: `src/server/repositories/aiDigestRepo.ts`

- [ ] **Step 1: 先写失败测试（service 不再传 `selectedCategoryIds`）**

```ts
expect(createAiDigestConfigMock).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({
    selectedFeedIds: [],
  }),
);
expect(createAiDigestConfigMock).not.toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({ selectedCategoryIds: expect.anything() }),
);
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit src/server/services/aiDigestLifecycleService.test.ts`

Expected: FAIL（当前 service 仍传 `selectedCategoryIds`）。

- [ ] **Step 3: 实现最小改动**

```ts
// aiDigestLifecycleService.ts
input: {
  title: string;
  prompt: string;
  intervalMinutes: number;
  selectedFeedIds: string[];
  categoryId?: string | null;
  categoryName?: string | null;
}

await createAiDigestConfig(client as never, {
  feedId,
  prompt: input.prompt,
  intervalMinutes: input.intervalMinutes,
  selectedFeedIds: input.selectedFeedIds,
  lastWindowEndAt: new Date().toISOString(),
});
```

```ts
// aiDigestRepo.ts
input: { ...; selectedFeedIds: string[]; /* removed selectedCategoryIds */ }
values ($1, $2, $3, $4, $5::uuid[], '{}'::uuid[], $6::timestamptz)
```

- [ ] **Step 4: 运行测试确认通过**

Run:
- `pnpm test:unit src/server/services/aiDigestLifecycleService.test.ts`
- `pnpm test:unit src/app/api/ai-digests/routes.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/server/services/aiDigestLifecycleService.ts src/server/services/aiDigestLifecycleService.test.ts src/server/repositories/aiDigestRepo.ts
git commit -m "refactor(ai-digest): 统一配置写入仅使用RSS来源" \
  -m "- 删除 service 与 repo 入参中的 selectedCategoryIds" \
  -m "- 新建配置时将 selected_category_ids 固定写为空数组"
```

### Task 6: worker 运行时移除分类展开逻辑（TDD）

**Files:**

- Modify: `src/worker/aiDigestGenerate.ts`
- Modify: `src/worker/aiDigestGenerate.test.ts`

- [ ] **Step 1: 先写失败测试（仅按 `selectedFeedIds` 过滤目标 feed）**

```ts
it('uses selectedFeedIds only when resolving target feeds', async () => {
  const listAiDigestCandidateArticlesMock = vi.fn().mockResolvedValue([]);
  const getAiDigestConfigByFeedIdMock = vi.fn().mockResolvedValue({
    feedId: 'feed-ai',
    prompt: 'x',
    intervalMinutes: 60,
    topN: 10,
    selectedFeedIds: [],
    lastWindowEndAt: '2026-03-14T00:00:00.000Z',
    createdAt: '2026-03-14T00:00:00.000Z',
    updatedAt: '2026-03-14T00:00:00.000Z',
  });

  // run...

  expect(listAiDigestCandidateArticlesMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ targetFeedIds: [] }),
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test:unit src/worker/aiDigestGenerate.test.ts`

Expected: FAIL（当前逻辑仍尝试按分类补全 feed）。

- [ ] **Step 3: 实现最小改动（删除分类展开）**

```ts
function resolveTargetFeedIds(input: { config: AiDigestConfigRow; feeds: Awaited<ReturnType<typeof listFeeds>> }): string[] {
  const rssFeedIds = new Set(input.feeds.filter((feed) => feed.kind === 'rss').map((feed) => feed.id));
  return uniq(input.config.selectedFeedIds.filter((id) => rssFeedIds.has(id)));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm test:unit src/worker/aiDigestGenerate.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/worker/aiDigestGenerate.ts src/worker/aiDigestGenerate.test.ts
git commit -m "fix(worker): 移除AI解读运行时分类来源扩展" \
  -m "- 候选来源解析仅保留 selectedFeedIds 与 rss 过滤" \
  -m "- 覆盖旧配置场景并保证行为与新契约一致"
```

## Chunk 3: 验证与交接

### Task 7: 回归验证与交付检查

**Files:**

- Modify: `docs/superpowers/plans/2026-03-16-ai-digest-source-treeselect.md`（勾选执行状态时可选）

- [ ] **Step 1: 运行前端目标测试集**

Run:
- `pnpm test:unit src/features/feeds/aiDigestSourceTree.utils.test.ts`
- `pnpm test:unit src/features/feeds/AiDigestSourceTreeSelect.test.tsx`
- `pnpm test:unit src/features/feeds/useAiDigestDialogForm.test.tsx`
- `pnpm test:unit src/features/feeds/AddAiDigestDialog.test.tsx`

Expected: PASS。

- [ ] **Step 2: 运行后端目标测试集**

Run:
- `pnpm test:unit src/app/api/ai-digests/routes.test.ts`
- `pnpm test:unit src/server/services/aiDigestLifecycleService.test.ts`
- `pnpm test:unit src/worker/aiDigestGenerate.test.ts`

Expected: PASS。

- [ ] **Step 3: 运行静态检查**

Run: `pnpm lint`

Expected: PASS（无新增 eslint 错误）。

- [ ] **Step 4: 手动验收（开发环境）**

Run:
- `pnpm dev`
- 打开 Reader，执行：
  - `添加 AI解读` -> 来源字段为树形
  - 分类可勾选联动子 RSS
  - 无 RSS 的分类不显示
  - 仅显示 RSS 标签，单行溢出为 `...(+N)`
  - 提交请求 body 不含 `selectedCategoryIds`

Expected: UI/请求行为符合 spec。

- [ ] **Step 5: 最终提交**

```bash
git add src/features/feeds src/app/api/ai-digests src/server/services/aiDigestLifecycleService.ts src/server/repositories/aiDigestRepo.ts src/worker/aiDigestGenerate.ts src/store/appStore.ts src/lib/apiClient.ts package.json pnpm-lock.yaml
git commit -m "feat(ai-digest): 完成来源TreeSelect与契约收敛改造" \
  -m "- 前端改为 rc-tree-select 并仅提交 selectedFeedIds" \
  -m "- 后端严格拒绝 selectedCategoryIds 且运行时仅按RSS来源解析"
```

## Plan Review Notes

- Chunk size 预估均小于 1000 行。
- 每个任务都包含：失败测试 -> 失败验证 -> 最小实现 -> 通过验证 -> 提交。
- 无 TODO/TBD 占位项；每个步骤有明确文件与命令。
