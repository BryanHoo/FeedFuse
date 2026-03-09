'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { NOTIFICATION_VIEWPORT_CLASS_NAME } from '@/lib/designSystem';
import { useNotificationContext } from './NotificationProvider';
import { cn } from '@/lib/utils';
import type { NotificationType } from './types';

const toneClassByType: Record<NotificationType, string> = {
  success: 'border-success/25 bg-success/12 text-success-foreground',
  error: 'border-error/25 bg-error/12 text-error-foreground',
  info: 'border-info/20 bg-info/10 text-info-foreground',
};

const iconClassByType: Record<NotificationType, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-info',
};

function TypeIcon({ type }: { type: NotificationType }) {
  const className = cn('h-4 w-4', iconClassByType[type]);

  if (type === 'success') return <CheckCircle2 aria-hidden="true" className={className} />;
  if (type === 'error') return <AlertCircle aria-hidden="true" className={className} />;
  return <Info aria-hidden="true" className={className} />;
}

export default function NotificationViewport() {
  const { notifications, dismiss } = useNotificationContext();

  return (
    <div
      data-testid="notification-viewport"
      aria-live="polite"
      aria-atomic="false"
      className={NOTIFICATION_VIEWPORT_CLASS_NAME}
    >
      {notifications.map((item) => (
        <div
          key={item.id}
          role={item.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-md backdrop-blur-sm transition-opacity motion-reduce:transition-none',
            toneClassByType[item.type],
          )}
        >
          <span className="mt-0.5 shrink-0">
            <TypeIcon type={item.type} />
          </span>
          <p className="min-w-0 flex-1 text-sm leading-5">{item.message}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            aria-label="关闭提醒"
            className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-accent/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
