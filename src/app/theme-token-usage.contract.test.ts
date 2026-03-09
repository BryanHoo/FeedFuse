import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('theme token usage contract', () => {
  it('uses semantic theme tokens in settings, notifications, feeds, and shared menus', () => {
    const settingsDrawerSource = readFileSync('src/features/settings/SettingsCenterDrawer.tsx', 'utf-8');
    const notificationViewportSource = readFileSync('src/features/notifications/NotificationViewport.tsx', 'utf-8');
    const feedDialogSource = readFileSync('src/features/feeds/FeedDialog.tsx', 'utf-8');
    const contextMenuSource = readFileSync('src/components/ui/context-menu.tsx', 'utf-8');
    const dialogSource = readFileSync('src/components/ui/dialog.tsx', 'utf-8');
    const sheetSource = readFileSync('src/components/ui/sheet.tsx', 'utf-8');
    const alertDialogSource = readFileSync('src/components/ui/alert-dialog.tsx', 'utf-8');

    expect(settingsDrawerSource).toContain('text-warning');
    expect(settingsDrawerSource).toContain('text-success');
    expect(settingsDrawerSource).toContain('text-error');
    expect(settingsDrawerSource).toContain('data-[state=active]:border-border');
    expect(settingsDrawerSource).not.toMatch(/\b(?:slate|gray|amber|emerald|red|blue)-/);
    expect(settingsDrawerSource).not.toContain('bg-white');

    expect(notificationViewportSource).toContain('border-success/25');
    expect(notificationViewportSource).toContain('bg-info/10');
    expect(notificationViewportSource).toContain('text-error-foreground');
    expect(notificationViewportSource).not.toMatch(/\b(?:slate|gray|amber|emerald|red)-/);
    expect(notificationViewportSource).not.toContain('bg-black/5');
    expect(notificationViewportSource).not.toContain('bg-white/10');

    expect(feedDialogSource).toContain("messageTone: 'text-success'");
    expect(feedDialogSource).not.toContain('emerald');

    expect(contextMenuSource).toContain('text-error');
    expect(contextMenuSource).toContain('bg-error/10');
    expect(contextMenuSource).toContain('shadow-popover');
    expect(contextMenuSource).not.toContain('text-red');
    expect(contextMenuSource).not.toContain('shadow-[');

    expect(dialogSource).toContain('bg-overlay');
    expect(sheetSource).toContain('bg-overlay');
    expect(alertDialogSource).toContain('bg-overlay');
    expect(dialogSource).not.toContain('bg-black/50');
    expect(sheetSource).not.toContain('bg-black/50');
    expect(alertDialogSource).not.toContain('bg-black/50');
  });
});
