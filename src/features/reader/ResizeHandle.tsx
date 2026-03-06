import type { PointerEventHandler } from 'react';

interface ResizeHandleProps {
  testId: string;
  active: boolean;
  onPointerDown?: PointerEventHandler<HTMLDivElement>;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
}

export default function ResizeHandle({
  testId,
  active,
  onPointerDown,
  onPointerEnter,
  onPointerLeave,
}: ResizeHandleProps) {
  return (
    <div className="relative z-10 h-full w-0 shrink-0 overflow-visible">
      <div
        role="separator"
        aria-orientation="vertical"
        data-testid={testId}
        data-active={active ? 'true' : 'false'}
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize touch-none"
      />
    </div>
  );
}
