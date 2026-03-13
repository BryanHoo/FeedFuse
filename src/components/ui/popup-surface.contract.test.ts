import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const popupSurfaceFiles = [
  'src/components/ui/dialog.tsx',
  'src/components/ui/sheet.tsx',
  'src/components/ui/alert-dialog.tsx',
  'src/components/ui/popover.tsx',
  'src/components/ui/select.tsx',
  'src/components/ui/context-menu.tsx',
  'src/components/ui/tooltip.tsx',
];

describe('popup surface contract', () => {
  it('uses fully opaque panel backgrounds for shared popup primitives', () => {
    for (const filePath of popupSurfaceFiles) {
      const source = readFileSync(filePath, 'utf-8');

      expect(source).not.toMatch(
        /supports-\[backdrop-filter\]:bg-(?:background|popover)\/\d+/,
      );
      expect(source).not.toMatch(/backdrop-blur-(?:sm|md)/);
    }
  });
});
