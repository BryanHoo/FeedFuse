import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ArticleView readability contract', () => {
  it('applies stronger article typography contrast and weight inside the prose container', () => {
    const source = readFileSync('src/features/articles/ArticleView.tsx', 'utf-8');

    expect(source).toContain('prose-headings:text-foreground/94');
    expect(source).toContain('prose-p:text-foreground/84');
    expect(source).toContain('prose-p:font-[450]');
    expect(source).toContain('prose-li:font-[450]');
    expect(source).toContain('prose-li:text-foreground/84');
    expect(source).toContain('prose-strong:text-foreground/96');
    expect(source).toContain('prose-blockquote:text-foreground/84');
    expect(source).toContain('prose-blockquote:border-border/90');
  });
});
