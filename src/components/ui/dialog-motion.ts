'use client';

import * as React from 'react';

type DialogLaunchOrigin = {
  x: number;
  y: number;
  recordedAt: number;
};

const DIALOG_LAUNCH_ORIGIN_TTL_MS = 1500;

let lastDialogLaunchOrigin: DialogLaunchOrigin | null = null;
let dialogMotionTrackingInitialized = false;

function recordDialogLaunchOrigin(x: number, y: number) {
  lastDialogLaunchOrigin = {
    x,
    y,
    recordedAt: Date.now(),
  };
}

function resolveElementCenter(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const rect = target.getBoundingClientRect();

  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function consumeRecentDialogLaunchOrigin() {
  if (!lastDialogLaunchOrigin) {
    return null;
  }

  if (Date.now() - lastDialogLaunchOrigin.recordedAt > DIALOG_LAUNCH_ORIGIN_TTL_MS) {
    lastDialogLaunchOrigin = null;
    return null;
  }

  const origin = lastDialogLaunchOrigin;
  lastDialogLaunchOrigin = null;
  return origin;
}

function handlePointerDown(event: PointerEvent) {
  recordDialogLaunchOrigin(event.clientX, event.clientY);
}

function handleKeyboardActivation(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return;
  }

  const origin =
    resolveElementCenter(event.target) ?? resolveElementCenter(document.activeElement);

  if (!origin) {
    return;
  }

  recordDialogLaunchOrigin(origin.x, origin.y);
}

export function ensureDialogMotionTracking() {
  if (dialogMotionTrackingInitialized || typeof document === 'undefined') {
    return;
  }

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('keydown', handleKeyboardActivation, true);
  dialogMotionTrackingInitialized = true;
}

function assignForwardedRef<T>(ref: React.ForwardedRef<T>, value: T | null) {
  if (!ref) {
    return;
  }

  if (typeof ref === 'function') {
    ref(value);
    return;
  }

  ref.current = value;
}

export function useDialogMotionContentProps<T extends HTMLElement>(
  ref: React.ForwardedRef<T>,
  style: React.CSSProperties | undefined,
) {
  const [node, setNode] = React.useState<T | null>(null);
  const [motionStyle, setMotionStyle] = React.useState<React.CSSProperties>();

  React.useLayoutEffect(() => {
    if (!node) {
      return;
    }

    const origin = consumeRecentDialogLaunchOrigin();

    if (!origin) {
      setMotionStyle(undefined);
      return;
    }

    const rect = node.getBoundingClientRect();

    setMotionStyle({
      transformOrigin: `${origin.x - rect.left}px ${origin.y - rect.top}px`,
    });
  }, [node]);

  const composedStyle = motionStyle ? { ...motionStyle, ...style } : style;

  return {
    ref(nodeValue: T | null) {
      setNode(nodeValue);
      assignForwardedRef(ref, nodeValue);
    },
    style: composedStyle,
  };
}

ensureDialogMotionTracking();
