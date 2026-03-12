export const DESIGN_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
} as const;

export const DIALOG_FORM_CONTENT_CLASS_NAME =
  'max-w-[var(--layout-dialog-form-max-width)]';

export const SETTINGS_CENTER_SHEET_CLASS_NAME =
  'w-full p-0 sm:max-w-[var(--layout-settings-drawer-max-width)]';

export const READER_FEED_DRAWER_SHEET_CLASS_NAME =
  'w-[min(88vw,var(--layout-reader-feed-drawer-max-width))] max-w-none p-0';

export const READER_TABLET_ARTICLE_PANE_CLASS_NAME =
  'w-[min(var(--layout-reader-tablet-list-max-width),42vw)] min-w-[var(--layout-reader-tablet-list-min-width)] shrink-0 border-r border-border bg-muted/5';

export const READER_PANE_HOVER_BACKGROUND_CLASS_NAME =
  'hover:bg-[var(--reader-pane-hover)]';

export const NOTIFICATION_VIEWPORT_CLASS_NAME =
  'pointer-events-none fixed right-3 top-3 z-[100] flex w-[min(var(--layout-notification-viewport-max-width),calc(100vw-1.5rem))] flex-col gap-2 sm:right-4 sm:top-4';

export const FROSTED_HEADER_CLASS_NAME =
  'border-b border-border/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80';

export const FLOATING_SURFACE_CLASS_NAME = 'bg-background/90 backdrop-blur-sm';
