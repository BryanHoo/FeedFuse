import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('layout metadata contract', () => {
  it('moves themeColor from metadata export to viewport export', () => {
    const source = readFileSync('src/app/layout.tsx', 'utf-8');
    const metadataStart = source.indexOf('export const metadata');
    const viewportStart = source.indexOf('export const viewport');

    expect(viewportStart).toBeGreaterThan(metadataStart);
    expect(source).toContain('themeColor');
    expect(source).toContain('export const viewport');

    const metadataBlock = source.slice(metadataStart, viewportStart);
    expect(metadataBlock).not.toContain('themeColor');
  });

  it('aligns viewport themeColor with the semantic page background', () => {
    const source = readFileSync('src/app/layout.tsx', 'utf-8');

    expect(source).toContain("color: '#f6f7f8'");
    expect(source).toContain("color: '#111a30'");
    expect(source).not.toContain("color: '#ffffff'");
    expect(source).not.toContain("color: '#f8f6f1'");
    expect(source).not.toContain("color: '#020817'");
  });
});
