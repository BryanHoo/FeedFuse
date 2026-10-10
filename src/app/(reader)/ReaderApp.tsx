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

const NEW_ARTICLES_CHECK_INTERVAL_MS = 60 * 1000;

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
  const lastNewArticlesCheckAtRef = useRef<number | null>(null);
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
    const checkForUpdates = () => {
      if (!userScopedStateReadyRef.current) {
        return;
      }

      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (
        lastNewArticlesCheckAtRef.current !== null &&
        now - lastNewArticlesCheckAtRef.current < NEW_ARTICLES_CHECK_INTERVAL_MS
      ) {
        return;
      }

      lastNewArticlesCheckAtRef.current = now;
      // 自动检查只产生新文章提示；用户点击后才合并快照，避免打断当前阅读。
      void useAppStore.getState().checkForNewArticles();
    };

    // 前台持续停留也会检查；后台标签页暂停请求，返回时按相同间隔节流。
    const interval = window.setInterval(checkForUpdates, NEW_ARTICLES_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', checkForUpdates);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', checkForUpdates);
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
