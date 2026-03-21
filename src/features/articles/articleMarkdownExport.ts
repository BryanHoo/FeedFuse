'use client';

import { toast } from '../toast/toast';

type ArticleMarkdownExportInput = {
  title: string;
  publishedAt: string;
  link: string;
  contentHtml: string;
};

type ArticleMarkdownDownloadInput = {
  filename: string;
  content: string;
};

const INLINE_TAG_NAMES = new Set([
  'a',
  'b',
  'code',
  'em',
  'i',
  'span',
  'strong',
]);

export function buildArticleMarkdownDocument(input: ArticleMarkdownExportInput): string {
  const title = input.title.trim() || 'Untitled Article';
  const sections = [
    `# ${title}`,
    '',
    `发布时间：${formatArticlePublishedAt(input.publishedAt)}`,
    `原文链接：${input.link.trim()}`,
  ];
  const bodyMarkdown = convertHtmlToMarkdown(input.contentHtml);

  if (bodyMarkdown) {
    sections.push('', bodyMarkdown);
  }

  return `${sections.join('\n').trimEnd()}\n`;
}

export function sanitizeArticleMarkdownFilename(title: string): string {
  const normalized = title
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${normalized || 'article'}.md`;
}

export function triggerArticleMarkdownDownload(input: ArticleMarkdownDownloadInput) {
  let objectUrl: string | null = null;

  try {
    const blob = new Blob([input.content], { type: 'text/markdown;charset=utf-8' });
    objectUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = input.filename;
    anchor.click();

    toast.success('文章已开始导出');
  } catch (error) {
    console.error(error);
    toast.error('文章导出失败');
  } finally {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

function convertHtmlToMarkdown(contentHtml: string): string {
  if (!contentHtml.trim()) {
    return '';
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(contentHtml, 'text/html');

  return renderBlocks(Array.from(document.body.childNodes)).trim();
}

function renderBlocks(nodes: Node[]): string {
  return nodes
    .map((node) => renderBlock(node))
    .filter(Boolean)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderBlock(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return collapseWhitespace(node.textContent ?? '');
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName[1]);
    return `${'#'.repeat(level)} ${renderInlineNodes(Array.from(node.childNodes))}`.trim();
  }

  if (tagName === 'p') {
    return renderInlineNodes(Array.from(node.childNodes));
  }

  if (tagName === 'blockquote') {
    const content = renderBlocks(Array.from(node.childNodes));
    return content
      .split('\n')
      .map((line) => (line.trim() ? `> ${line}` : '>'))
      .join('\n');
  }

  if (tagName === 'pre') {
    const code = node.textContent?.trim() ?? '';
    return code ? `\`\`\`\n${code}\n\`\`\`` : '';
  }

  if (tagName === 'ul') {
    return renderList(node, false);
  }

  if (tagName === 'ol') {
    return renderList(node, true);
  }

  if (tagName === 'hr') {
    return '---';
  }

  if (tagName === 'img') {
    const src = node.getAttribute('src')?.trim() ?? '';
    if (!src) {
      return '';
    }

    const alt = node.getAttribute('alt')?.trim() ?? '';
    return `![${alt}](${src})`;
  }

  const childNodes = Array.from(node.childNodes);
  if (isInlineContainer(node)) {
    return renderInlineNodes(childNodes);
  }

  // Unknown block-like containers should preserve readable content instead of leaking raw HTML.
  return renderBlocks(childNodes);
}

function renderInlineNodes(nodes: Node[]): string {
  return nodes
    .map((node) => renderInlineNode(node))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function renderInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return collapseWhitespace(node.textContent ?? '');
  }

  if (!(node instanceof HTMLElement)) {
    return '';
  }

  const tagName = node.tagName.toLowerCase();
  const content = renderInlineNodes(Array.from(node.childNodes));

  if (tagName === 'strong' || tagName === 'b') {
    return content ? `**${content}**` : '';
  }

  if (tagName === 'em' || tagName === 'i') {
    return content ? `*${content}*` : '';
  }

  if (tagName === 'code') {
    return content ? `\`${content}\`` : '';
  }

  if (tagName === 'a') {
    const href = node.getAttribute('href')?.trim() ?? '';
    const label = content || href;
    return href ? `[${label}](${href})` : label;
  }

  if (tagName === 'br') {
    return '\n';
  }

  if (tagName === 'img') {
    const src = node.getAttribute('src')?.trim() ?? '';
    if (!src) {
      return '';
    }

    const alt = node.getAttribute('alt')?.trim() ?? '';
    return `![${alt}](${src})`;
  }

  return content;
}

function renderList(listElement: HTMLElement, ordered: boolean): string {
  return Array.from(listElement.children)
    .filter((child): child is HTMLLIElement => child instanceof HTMLLIElement)
    .map((item, index) => renderListItem(item, ordered ? `${index + 1}.` : '-'))
    .join('\n');
}

function renderListItem(item: HTMLLIElement, marker: string): string {
  const inlineParts: string[] = [];
  const nestedParts: string[] = [];

  for (const child of Array.from(item.childNodes)) {
    if (child instanceof HTMLElement && (child.tagName.toLowerCase() === 'ul' || child.tagName.toLowerCase() === 'ol')) {
      const nested = renderBlock(child);
      if (nested) {
        nestedParts.push(indentMarkdown(nested));
      }
      continue;
    }

    inlineParts.push(renderInlineNode(child));
  }

  const mainLine = `${marker} ${inlineParts.join('').replace(/[ \t]{2,}/g, ' ').trim()}`.trimEnd();
  return [mainLine, ...nestedParts].filter(Boolean).join('\n');
}

function indentMarkdown(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n');
}

function isInlineContainer(element: HTMLElement): boolean {
  return INLINE_TAG_NAMES.has(element.tagName.toLowerCase());
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ');
}

function formatArticlePublishedAt(publishedAt: string): string {
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    return publishedAt;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
