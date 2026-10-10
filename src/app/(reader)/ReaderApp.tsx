'use client';

import { BatchReadProgress } from '@/features/articles/components/BatchReadProgress';
import ReaderLayout from '../../features/reader/components/ReaderLayout';
import { ToastHost } from '../../features/toast/components/ToastHost';
import { useTheme } from '../../hooks';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { getCurrentUser } from '../../lib/api/apiClient';
import type { CurrentUser } from '../../lib/api/apiClient';
import { useAuthStore } from '../../store/authStore';
import type { ViewType } from '../../types';

const AUTO_SNAPSHOT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface ReaderAppProps {
  renderedAt?: string;
  initialSelectedView?: ViewType;
  initialCurrentUser?: CurrentUser;
}

export default function ReaderApp({
  renderedAt,
  initialSelectedView,
  initialCurrentUser,
}: ReaderAppProps) {
  useTheme();
  const selectedView = useAppStore((state) => state.selectedView);
  const loadSnapshot = useAppStore((state) => state.loadSnapshot);
  const rehydrateUserScopedLocalState = useAppStore((state) => state.rehydrateUserScopedLocalState);
  const hydratePersistedSettings = useSettingsStore((state) => state.hydratePersistedSettings);
  const currentUserId = useAuthStore((state) => state.currentUser?.id);
  const setCurrentUser = useAuthStore((state) => state.setCurrentUser);
  const lastAutoSnapshotAtRef = useRef<number | null>(null);
  const userScopedStateReadyRef = useRef(false);
  const [userScopedStateReady, setUserScopedStateReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    userScopedStateReadyRef.current = false;

    const hydrateCurrentUserLocalState = async () => {
      await useSettingsStore.persist.rehydrate();
      if (cancelled) return;

      await hydratePersistedSettings();
      if (cancelled) return;

      // 远端设置确定后再计算阅读器本地状态，避免普通用户继承 anonymous 或旧全局缓存。
      rehydrateUserScopedLocalState();
      userScopedStateReadyRef.current = true;
      setUserScopedStateReady(true);
    };

    void (async () => {
      try {
        // 首次导航复用服务端会话结果，客户端路由场景仍保留接口回退。
        const user = initialCurrentUser ?? await getCurrentUser({ notifyOnError: false });
        if (cancelled) return;
        setCurrentUser(user);
      } catch {
        if (cancelled) return;
        setCurrentUser(null);
        await hydrateCurrentUserLocalState();
        return;
      }

      await hydrateCurrentUserLocalState();
    })();

    return () => {
      cancelled = true;
      userScopedStateReadyRef.current = false;
    };
  }, [hydratePersistedSettings, initialCurrentUser, rehydrateUserScopedLocalState, setCurrentUser]);

  useEffect(() => {
    if (!userScopedStateReady) return;
    void loadSnapshot({ view: selectedView });
  }, [loadSnapshot, selectedView, userScopedStateReady]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!userScopedStateReadyRef.current) {
        return;
      }

      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (
        lastAutoSnapshotAtRef.current !== null &&
        now - lastAutoSnapshotAtRef.current < AUTO_SNAPSHOT_REFRESH_INTERVAL_MS
      ) {
        return;
      }

      lastAutoSnapshotAtRef.current = now;
      const { selectedView: currentView, loadSnapshot: reloadSnapshot } = useAppStore.getState();
      void reloadSnapshot({ view: currentView });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <>
      <ReaderLayout renderedAt={renderedAt} initialSelectedView={initialSelectedView} />
      {userScopedStateReady && currentUserId && <BatchReadProgress key={currentUserId} userId={currentUserId} />}
      <ToastHost />
    </>
  );
}
