let currentNotifier: ((message: string) => void) | null = null;

export function setApiErrorNotifier(notifier: (message: string) => void) {
  currentNotifier = notifier;
}

export function clearApiErrorNotifier() {
  currentNotifier = null;
}

export function notifyApiError(message: string) {
  currentNotifier?.(message);
}
