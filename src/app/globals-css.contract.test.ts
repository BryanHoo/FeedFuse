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
    expect(css).toContain('--layout-notification-viewport-max-width: 28rem');
    expect(css).toContain('--layout-reader-feed-drawer-max-width');
    expect(css).toContain('--layout-reader-tablet-list-max-width');
    expect(css).toContain('--layout-reader-tablet-list-min-width');
    expect(css).toContain('--color-background: hsl(210 12% 97%)');
    expect(css).toContain('--color-card: hsl(210 14% 98%)');
    expect(css).toContain('--color-primary: hsl(221 67% 47%)');
    expect(css).toContain('--color-accent: hsl(214 74% 94%)');
    expect(css).toContain('--color-ring: hsl(220 80% 56%)');
    expect(css).toContain(
      '--reader-pane-hover: color-mix(in oklab, var(--color-primary) 14%, var(--color-card))',
    );
    expect(css).toContain('--color-background: hsl(224 31% 12%)');
    expect(css).toContain('--color-primary: hsl(213 92% 72%)');
    expect(css).not.toContain('--color-background: hsl(0 0% 100%)');
    expect(css).not.toContain('--color-primary: hsl(221.2 83.2% 53.3%)');
    expect(css).not.toContain('--color-background: hsl(222.2 84% 4.9%)');
    expect(css).not.toContain('--color-primary: hsl(217.2 91.2% 59.8%)');
    expect(css).not.toContain('--color-background: hsl(42 35% 96%)');
    expect(css).not.toContain('--color-primary: hsl(224 54% 42%)');
    expect(css).not.toContain('--color-accent: hsl(221 37% 92%)');
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
