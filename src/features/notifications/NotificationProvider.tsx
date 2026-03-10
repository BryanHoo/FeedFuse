'use client';

import type React from 'react';
import { ToastHost } from '../toast/ToastHost';
import type { NotificationItem } from './types';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
    </>
  );
}

export function useNotificationContext(): {
  notifications: NotificationItem[];
  dismiss: (id: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  error: (message: string) => void;
} {
  throw new Error('useNotificationContext is no longer supported. Use toast.* instead.');
}
