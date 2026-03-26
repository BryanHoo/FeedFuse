import { describe, expect, it } from 'vitest';
import {
  buildArticleMarkdownDocument,
  sanitizeArticleMarkdownFilename,
} from './articleMarkdownExport';

describe('buildArticleMarkdownDocument', () => {
  it('includes title, metadata, and markdown body converted from html', () => {
    const markdown = buildArticleMarkdownDocument({
      title: 'Hello / World',
      publishedAt: '2026-03-21T10:00:00.000Z',
      link: 'https://example.com/post',
      contentHtml:
        '<p>Hello <strong>world</strong></p><ul><li>One</li></ul><blockquote><p>Quote</p></blockquote>',
    });

    expect(markdown).toContain('# Hello / World');
    expect(markdown).toContain('发布时间：');
    expect(markdown).toContain('原文链接：https://example.com/post');
    expect(markdown).toContain('Hello **world**');
    expect(markdown).toContain('- One');
    expect(markdown).toContain('> Quote');
  });

  it('keeps metadata even when the body html is empty', () => {
    const markdown = buildArticleMarkdownDocument({
      title: 'Empty Body',
      publishedAt: '2026-03-21T10:00:00.000Z',
      link: 'https://example.com/empty',
      contentHtml: '',
    });

    expect(markdown).toContain('# Empty Body');
    expect(markdown).toContain('原文链接：https://example.com/empty');
  });

  it('exports original image urls instead of internal proxy urls', () => {
    const markdown = buildArticleMarkdownDocument({
      title: 'Proxy Image',
      publishedAt: '2026-03-21T10:00:00.000Z',
      link: 'https://example.com/proxy-image',
      contentHtml:
        '<p>Cover</p><img src="/api/media/image?url=https%3A%2F%2Fimg.example.com%2Fa.jpg&sig=test" alt="cover" />',
    });

    expect(markdown).toContain('![cover](https://img.example.com/a.jpg)');
    expect(markdown).not.toContain('/api/media/image?');
  });
});

describe('sanitizeArticleMarkdownFilename', () => {
  it('replaces invalid filename characters and appends md suffix', () => {
    expect(sanitizeArticleMarkdownFilename('Hello: / World?')).toBe('Hello World.md');
  });

  it('falls back to article.md when title is empty', () => {
    expect(sanitizeArticleMarkdownFilename('   ')).toBe('article.md');
  });
});
