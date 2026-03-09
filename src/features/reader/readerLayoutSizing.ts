import { DESIGN_BREAKPOINTS } from '@/lib/designSystem';

export const READER_LEFT_PANE_MIN_WIDTH = 200;
export const READER_LEFT_PANE_MAX_WIDTH = 420;
export const READER_LEFT_PANE_DEFAULT_WIDTH = 240;
export const READER_MIDDLE_PANE_MIN_WIDTH = 320;
export const READER_MIDDLE_PANE_MAX_WIDTH = 640;
export const READER_MIDDLE_PANE_DEFAULT_WIDTH = 400;
export const READER_RIGHT_PANE_MIN_WIDTH = 480;
export const READER_TABLET_MIN_WIDTH = DESIGN_BREAKPOINTS.md;
export const READER_RESIZE_DESKTOP_MIN_WIDTH = DESIGN_BREAKPOINTS.lg;

export function normalizeReaderPaneWidth(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
