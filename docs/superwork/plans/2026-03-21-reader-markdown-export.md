# Reader Markdown Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 由于仓库策略禁止 subagent，实现时使用 `superwork-executing-plans` 按任务顺序内联执行。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**Goal:** 在桌面阅读页右栏顶部新增导出按钮，直接下载当前文章的 Markdown 文件，内容包含标题、发布时间、原文链接和由原始正文 HTML 转换得到的 Markdown。

**Architecture:** 保持现有阅读页数据流不变，在 `ArticleView` 的桌面工具栏内接入一个本地导出动作。将 Markdown 组装、文件名清洗和下载触发拆到独立辅助模块，组件只负责读取当前文章并调用导出函数。测试分成纯函数单测和阅读页集成测试两层，最终用 `pnpm build` 做构建验证。

**Tech Stack:** Next.js 16、React 19、TypeScript、Vitest、Testing Library、JSDOM、pnpm

---

### Task 1: 实现 Markdown 导出辅助模块

**Files:**
- Create: `src/features/articles/articleMarkdownExport.ts`
- Test: `src/features/articles/articleMarkdownExport.test.ts`
- Check: `docs/superwork/specs/2026-03-21-reader-markdown-export-design.md`

- [ ] **Step 1: 写纯函数失败测试，锁定导出文本结构和文件名规则**

```ts
import { describe, expect, it } from 'vitest';
import {
  buildArticleMarkdownDocument,
  sanitizeArticleMarkdownFilename,
} from './articleMarkdownExport';

describe('buildArticleMarkdownDocument', () => {
  it('includes title, published time, source link, and markdown body', () => {
    const markdown = buildArticleMarkdownDocument({
      title: 'Hello / World',
      publishedAt: '2026-03-21T10:00:00.000Z',
      link: 'https://example.com/post',
      contentHtml: '<p>Hello <strong>world</strong></p><ul><li>One</li></ul>',
    });

    expect(markdown).toContain('# Hello / World');
    expect(markdown).toContain('发布时间：');
    expect(markdown).toContain('原文链接：https://example.com/post');
    expect(markdown).toContain('Hello **world**');
    expect(markdown).toContain('- One');
  });
});

describe('sanitizeArticleMarkdownFilename', () => {
  it('falls back to article.md when title is empty', () => {
    expect(sanitizeArticleMarkdownFilename('')).toBe('article.md');
  });
});
```

- [ ] **Step 2: 运行纯函数测试，确认当前实现缺失导致失败**

Run: `pnpm test:unit -- src/features/articles/articleMarkdownExport.test.ts`
Expected: FAIL，提示找不到新模块或导出函数。

- [ ] **Step 3: 用最小实现创建导出辅助模块**

```ts
type ArticleMarkdownExportInput = {
  title: string;
  publishedAt: string;
  link: string;
  contentHtml: string;
};

export function buildArticleMarkdownDocument(input: ArticleMarkdownExportInput): string {
  const bodyMarkdown = convertHtmlToMarkdown(input.contentHtml);
  const sections = [
    `# ${input.title.trim() || 'Untitled Article'}`,
    '',
    `发布时间：${formatArticlePublishedAt(input.publishedAt)}`,
    `原文链接：${input.link.trim()}`,
    '',
    bodyMarkdown,
  ];

  return sections.join('\n').trimEnd() + '\n';
}

export function sanitizeArticleMarkdownFilename(title: string): string {
  const normalized = title.replace(/[\\\\/:*?\"<>|]/g, ' ').trim();
  return `${normalized || 'article'}.md`;
}
```

实现要求：

- 使用 DOM 解析 HTML，再按常见语义节点递归转 Markdown
- 优先支持 `h1-h6`、`p`、`a`、`strong`、`em`、`blockquote`、`ul`、`ol`、`li`、`pre`、`code`、`img`、`hr`
- 对未知标签保留文本内容，忽略视觉属性
- 正文为空时仍返回只含元信息的 Markdown 文本
- 在关键转换分支补简短注释，解释为何做语义退化

- [ ] **Step 4: 重新运行纯函数测试，确认转换与文件名规则通过**

Run: `pnpm test:unit -- src/features/articles/articleMarkdownExport.test.ts`
Expected: PASS

- [ ] **Step 5: 提交辅助模块与单测**

```bash
git add src/features/articles/articleMarkdownExport.ts src/features/articles/articleMarkdownExport.test.ts
git commit -m "feat(article-export): 添加文章 Markdown 导出工具" -m "- 添加文章 HTML 到 Markdown 的本地转换能力
- 添加导出文件名清洗和元信息组装逻辑
- 添加导出辅助模块的单元测试"
```

### Task 2: 将导出动作接入 ArticleView 桌面工具栏

**Files:**
- Modify: `src/features/articles/ArticleView.tsx`
- Create: `src/features/articles/ArticleView.export.test.tsx`
- Reuse: `src/features/reader/ReaderToolbarIconButton.tsx`
- Reuse: `src/features/articles/articleMarkdownExport.ts`

- [ ] **Step 1: 写集成失败测试，覆盖按钮显示与点击下载**

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ArticleView from './ArticleView';

describe('ArticleView markdown export', () => {
  it('shows export action in desktop toolbar when an article is selected', async () => {
    render(<ArticleView />);
    expect(await screen.findByRole('button', { name: '导出 Markdown' })).toBeInTheDocument();
  });

  it('downloads a markdown file when export is clicked', async () => {
    const createObjectUrl = vi.fn(() => 'blob:article');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    render(<ArticleView />);
    fireEvent.click(await screen.findByRole('button', { name: '导出 Markdown' }));

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
  });
});
```

测试要求：

- 复用现有 `ArticleView` 测试的 store 初始化模式
- 将 `window.innerWidth` 设为桌面宽度，确保桌面工具栏渲染
- 增加“无文章时不显示导出按钮”断言
- 通过 spy/stub 验证 `URL.createObjectURL`、`URL.revokeObjectURL` 和锚点点击行为

- [ ] **Step 2: 运行集成测试，确认新增行为尚未实现**

Run: `pnpm test:unit -- src/features/articles/ArticleView.export.test.tsx`
Expected: FAIL，提示找不到“导出 Markdown”按钮或下载调用未发生。

- [ ] **Step 3: 在 ArticleView 中接入导出按钮和点击处理**

```tsx
import { Download, FileText, Languages, Settings as SettingsIcon, Sparkles, Star } from 'lucide-react';
import {
  buildArticleMarkdownDocument,
  sanitizeArticleMarkdownFilename,
  triggerArticleMarkdownDownload,
} from './articleMarkdownExport';

function onMarkdownExportButtonClick() {
  if (!article) return;

  const markdown = buildArticleMarkdownDocument({
    title: titleOriginal,
    publishedAt: article.publishedAt,
    link: article.link,
    contentHtml: article.content,
  });

  triggerArticleMarkdownDownload({
    filename: sanitizeArticleMarkdownFilename(titleOriginal),
    content: markdown,
  });
}
```

实现要求：

- 按钮仅在存在当前文章时显示
- 按钮位于桌面工具栏，与收藏、抓取全文等动作并列
- 复用 `ReaderToolbarIconButton`
- 按钮标签固定为 `导出 Markdown`
- 下载失败时记录错误并给出最小化用户提示，不引入全局状态

- [ ] **Step 4: 运行集成测试，确认按钮与下载链路通过**

Run: `pnpm test:unit -- src/features/articles/ArticleView.export.test.tsx`
Expected: PASS

- [ ] **Step 5: 运行导出相关测试集合，确认纯函数与集成都通过**

Run: `pnpm test:unit -- src/features/articles/articleMarkdownExport.test.ts src/features/articles/ArticleView.export.test.tsx`
Expected: PASS

- [ ] **Step 6: 提交工具栏接入与集成测试**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/ArticleView.export.test.tsx src/features/articles/articleMarkdownExport.ts src/features/articles/articleMarkdownExport.test.ts
git commit -m "feat(article-view): 添加文章 Markdown 导出入口" -m "- 添加桌面阅读页顶部导出 Markdown 按钮
- 接入当前文章原始正文的本地下载流程
- 添加工具栏导出行为的集成测试"
```

### Task 3: 做回归验证并收尾

**Files:**
- Verify: `src/features/articles/ArticleView.tsx`
- Verify: `src/features/articles/articleMarkdownExport.ts`
- Verify: `src/features/articles/ArticleView.export.test.tsx`
- Verify: `src/features/articles/articleMarkdownExport.test.ts`
- Check: `docs/superwork/specs/2026-03-21-reader-markdown-export-design.md`

- [ ] **Step 1: 运行文章相关单元测试，确认没有打破现有阅读页行为**

Run: `pnpm test:unit -- src/features/articles/ArticleView.export.test.tsx src/features/articles/articleMarkdownExport.test.ts src/features/articles/ArticleView.outline.test.tsx src/features/articles/ArticleView.titleLink.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行完整构建验证，满足仓库的代码变更校验要求**

Run: `pnpm build`
Expected: PASS，Next.js 构建完成且无类型错误。

- [ ] **Step 3: 人工检查最终 diff，确认范围没有扩散**

Run: `git diff --stat -- src/features/articles/ArticleView.tsx src/features/articles/articleMarkdownExport.ts src/features/articles/ArticleView.export.test.tsx src/features/articles/articleMarkdownExport.test.ts`
Expected: 仅包含导出辅助模块、`ArticleView` 接入和新增测试文件；不应出现无关文件修改。

- [ ] **Step 4: 如果需要补一个收尾提交，仅提交验证后的小修正**

```bash
git add src/features/articles/ArticleView.tsx src/features/articles/articleMarkdownExport.ts src/features/articles/ArticleView.export.test.tsx src/features/articles/articleMarkdownExport.test.ts
git commit -m "fix(article-export): 收敛导出边界与验证细节" -m "- 修复验证阶段发现的导出格式细节问题
- 优化异常分支和文件名处理的边界情况
- 保持最终改动范围聚焦在文章导出能力"
```

仅当验证阶段产生真实代码改动时执行本步骤。
