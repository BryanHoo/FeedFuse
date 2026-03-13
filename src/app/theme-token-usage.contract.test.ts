import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('theme token usage contract', () => {
  it('uses semantic theme tokens in settings, notifications, feeds, and shared menus', () => {
    const settingsDrawerSource = readFileSync('src/features/settings/SettingsCenterDrawer.tsx', 'utf-8');
    const toastHostSource = readFileSync('src/features/toast/ToastHost.tsx', 'utf-8');
    const feedDialogSource = readFileSync('src/features/feeds/FeedDialog.tsx', 'utf-8');
    const contextMenuSource = readFileSync('src/components/ui/context-menu.tsx', 'utf-8');
    const tooltipSource = readFileSync('src/components/ui/tooltip.tsx', 'utf-8');
    const popoverSource = readFileSync('src/components/ui/popover.tsx', 'utf-8');
    const selectSource = readFileSync('src/components/ui/select.tsx', 'utf-8');
    const dialogSource = readFileSync('src/components/ui/dialog.tsx', 'utf-8');
    const sheetSource = readFileSync('src/components/ui/sheet.tsx', 'utf-8');
    const alertDialogSource = readFileSync('src/components/ui/alert-dialog.tsx', 'utf-8');

    expect(settingsDrawerSource).toContain('text-warning');
    expect(settingsDrawerSource).toContain('text-success');
    expect(settingsDrawerSource).toContain('text-error');
    expect(settingsDrawerSource).toContain('data-[state=active]:border-border');
    expect(settingsDrawerSource).not.toMatch(/\b(?:slate|gray|amber|emerald|red|blue)-/);
    expect(settingsDrawerSource).not.toContain('bg-white');

    expect(toastHostSource).toContain('border-success/20');
    expect(toastHostSource).toContain('border-info/20');
    expect(toastHostSource).toContain('border-error/30');
    expect(toastHostSource).toContain('bg-background/92');
    expect(toastHostSource).toContain('bg-error/12');
    expect(toastHostSource).toContain('shadow-popover');
    expect(toastHostSource).toContain('data-[state=open]:slide-in-from-top-2');
    expect(toastHostSource).toContain('data-[state=closed]:slide-out-to-top-2');
    expect(toastHostSource).not.toContain('bg-success/12');
    expect(toastHostSource).not.toContain('text-error-foreground');
    expect(toastHostSource).not.toContain('right-3 top-3');
    expect(toastHostSource).not.toContain('shadow-md');
    expect(toastHostSource).not.toMatch(/\b(?:slate|gray|amber|emerald|red)-/);
    expect(toastHostSource).not.toContain('bg-black/5');
    expect(toastHostSource).not.toContain('bg-white/10');

    expect(feedDialogSource).toContain("messageTone: 'text-success'");
    expect(feedDialogSource).not.toContain('emerald');

    expect(contextMenuSource).toContain('text-error');
    expect(contextMenuSource).toContain('bg-error/10');
    expect(contextMenuSource).toContain('shadow-popover');
    expect(contextMenuSource).not.toContain('text-red');
    expect(contextMenuSource).not.toContain('shadow-[');

    expect(tooltipSource).toContain('bg-popover');
    expect(tooltipSource).toContain('text-popover-foreground');
    expect(tooltipSource).toContain('shadow-popover');
    expect(tooltipSource).not.toContain('bg-black/80');

    expect(popoverSource).toContain('shadow-popover');
    expect(popoverSource).not.toContain('shadow-md');

    expect(selectSource).toContain('shadow-popover');
    expect(selectSource).not.toContain('shadow-sm');

    expect(dialogSource).toContain('bg-overlay');
    expect(sheetSource).toContain('bg-overlay');
    expect(alertDialogSource).toContain('bg-overlay');
    expect(dialogSource).not.toContain('shadow-md');
    expect(sheetSource).not.toContain('shadow-md');
    expect(alertDialogSource).not.toContain('shadow-md');
    expect(dialogSource).not.toContain('bg-black/50');
    expect(sheetSource).not.toContain('bg-black/50');
    expect(alertDialogSource).not.toContain('bg-black/50');
  });
});
