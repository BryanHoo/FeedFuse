import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('globals.css contract', () => {
  it('uses tailwind v4 import and class-based dark variant', () => {
    const css = readFileSync('src/app/globals.css', 'utf-8');
    expect(css).toContain('@import "tailwindcss";');
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
    expect(css).toContain('@plugin "tailwindcss-animate";');
    expect(css).toContain('--color-background');
    expect(css).toContain('--color-foreground');
    expect(css).toContain('--color-primary');
    expect(css).toContain('--color-ring');
    expect(css).toContain('--color-success');
    expect(css).toContain('--color-success-foreground');
    expect(css).toContain('--color-warning');
    expect(css).toContain('--color-warning-foreground');
    expect(css).toContain('--color-info');
    expect(css).toContain('--color-info-foreground');
    expect(css).toContain('--color-error');
    expect(css).toContain('--color-error-foreground');
    expect(css).toContain('--color-overlay');
    expect(css).toContain('--shadow-popover');
    expect(css).toContain('--breakpoint-sm');
    expect(css).toContain('--breakpoint-md');
    expect(css).toContain('--breakpoint-lg');
    expect(css).toContain('--layout-dialog-form-max-width');
    expect(css).toContain('--layout-settings-drawer-max-width');
    expect(css).toContain('--layout-notification-viewport-max-width');
    expect(css).toContain('--layout-reader-feed-drawer-max-width');
    expect(css).toContain('--layout-reader-tablet-list-max-width');
    expect(css).toContain('--layout-reader-tablet-list-min-width');
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('.font-brand');
  });

  it('does not balance-wrap heading text', () => {
    const css = readFileSync('src/app/globals.css', 'utf-8');
    const headingRuleMatch = css.match(/:where\(h1, h2, h3, h4, h5, h6\)\s*\{([\s\S]*?)\}/);

    expect(headingRuleMatch?.[1]).toBeDefined();
    expect(headingRuleMatch?.[1]).not.toContain('text-wrap: balance;');
  });
});
