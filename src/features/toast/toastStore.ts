import { create } from 'zustand';

export type ToastTone = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  message: string;
  dedupeKey: string;
  createdAt: number;
  durationMs: number;
}

const TTL_BY_TONE: Record<ToastTone, number> = {
  success: 1800,
  info: 2500,
  error: 4500,
};

const DEDUPE_WINDOW_MS = 1500;
const MAX_STACK = 3;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trimStack(input: ToastItem[]): ToastItem[] {
  if (input.length <= MAX_STACK) return input;
  const next = [...input];
  while (next.length > MAX_STACK) {
    const removableIndex = next.findIndex((item) => item.tone !== 'error');
    const targetIndex = removableIndex >= 0 ? removableIndex : 0;
    next.splice(targetIndex, 1);
  }
  return next;
}

type PushInput = {
  tone: ToastTone;
  message: string;
  id?: string;
  dedupeKey?: string;
  durationMs?: number;
};

type ToastState = {
  toasts: ToastItem[];
  push: (input: PushInput) => string;
  dismiss: (id?: string) => void;
  reset: () => void;
};

const lastSeenAtByKey = new Map<string, number>();

export const toastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: ({ tone, message: rawMessage, id, dedupeKey: dedupeKeyInput, durationMs }) => {
    const message = rawMessage.trim();
    if (!message) return '';

    const now = Date.now();
    const dedupeKey = dedupeKeyInput ?? `${tone}:${message}`;

    const lastSeenAt = lastSeenAtByKey.get(dedupeKey);
    if (typeof lastSeenAt === 'number' && now - lastSeenAt <= DEDUPE_WINDOW_MS) {
      const existing = get().toasts.find((item) => item.dedupeKey === dedupeKey);
      if (existing) return existing.id;
    }

    lastSeenAtByKey.set(dedupeKey, now);

    const resolvedId = id ?? generateId();
    const nextItem: ToastItem = {
      id: resolvedId,
      tone,
      message,
      dedupeKey,
      createdAt: now,
      durationMs: typeof durationMs === 'number' ? durationMs : TTL_BY_TONE[tone],
    };

    set((state) => {
      const existingIndex = state.toasts.findIndex((item) => item.id === resolvedId);
      if (existingIndex >= 0) {
        const next = [...state.toasts];
        next[existingIndex] = { ...next[existingIndex], ...nextItem };
        return { toasts: next };
      }
      return { toasts: trimStack([...state.toasts, nextItem]) };
    });

    return resolvedId;
  },
  dismiss: (id) => {
    if (!id) {
      set({ toasts: [] });
      return;
    }
    set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
  },
  reset: () => {
    lastSeenAtByKey.clear();
    set({ toasts: [] });
  },
}));

