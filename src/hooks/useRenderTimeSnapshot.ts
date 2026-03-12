import { useMemo, useSyncExternalStore } from 'react';

function getInitialRenderTime(renderedAt?: string): Date {
  if (renderedAt) {
    const snapshot = new Date(renderedAt);
    if (!Number.isNaN(snapshot.getTime())) {
      return snapshot;
    }
  }

  return new Date();
}

export function useRenderTimeSnapshot(renderedAt?: string): Date {
  const serverSnapshot = useMemo(() => getInitialRenderTime(renderedAt), [renderedAt]);
  const clientSnapshot = useMemo(() => {
    void renderedAt;
    return new Date();
  }, [renderedAt]);

  return useSyncExternalStore(
    () => () => undefined,
    () => clientSnapshot,
    () => serverSnapshot,
  );
}
