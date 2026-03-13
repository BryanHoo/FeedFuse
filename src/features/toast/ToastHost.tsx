'use client';

import * as RadixToast from '@radix-ui/react-toast';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useLayoutEffect } from 'react';
import { clearApiErrorNotifier, setApiErrorNotifier } from '@/lib/apiErrorNotifier';
import { TOP_MESSAGE_VIEWPORT_CLASS_NAME } from '@/lib/designSystem';
import { cn } from '@/lib/utils';
import { toast } from './toast';
import { toastStore, type ToastTone } from './toastStore';

const toneClassByTone: Record<ToastTone, string> = {
  success: 'border-success/20 bg-background/92 text-foreground',
  info: 'border-info/20 bg-background/92 text-foreground',
  error: 'border-error/30 bg-error/12 text-foreground',
};

const iconClassByTone: Record<ToastTone, string> = {
  success: 'text-success',
  error: 'text-error',
  info: 'text-info',
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const className = cn('h-4 w-4', iconClassByTone[tone]);
  if (tone === 'success') return <CheckCircle2 aria-hidden="true" className={className} />;
  if (tone === 'error') return <AlertCircle aria-hidden="true" className={className} />;
  return <Info aria-hidden="true" className={className} />;
}

export function ToastHost() {
  const toasts = toastStore((state) => state.toasts);
  const dismiss = toastStore((state) => state.dismiss);
  const orderedToasts = [...toasts].reverse();

  useLayoutEffect(() => {
    setApiErrorNotifier((message) => {
      toast.error(message);
    });

    return () => {
      clearApiErrorNotifier();
      toastStore.getState().reset();
    };
  }, []);

  return (
    <RadixToast.Provider label="通知" swipeDirection="right">
      {orderedToasts.map((item) => (
        <RadixToast.Root
          key={item.id}
          open
          duration={item.durationMs}
          onOpenChange={(open) => {
            if (!open) dismiss(item.id);
          }}
          role={item.tone === 'error' ? 'alert' : 'status'}
          aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
          className={cn(
            'pointer-events-auto flex w-full max-w-[min(var(--layout-notification-viewport-max-width),calc(100vw-1rem))] items-center gap-3 rounded-xl border px-3.5 py-2.5 shadow-popover backdrop-blur-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:slide-in-from-top-2 data-[state=closed]:slide-out-to-top-2',
            toneClassByTone[item.tone],
          )}
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/70">
            <ToneIcon tone={item.tone} />
          </span>
          <RadixToast.Description className="min-w-0 flex-1 text-sm font-medium leading-5">
            {item.message}
          </RadixToast.Description>
          <RadixToast.Close
            aria-label="关闭提醒"
            className="-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-accent/70 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <X size={14} />
          </RadixToast.Close>
        </RadixToast.Root>
      ))}

      <RadixToast.Viewport
        data-testid="notification-viewport"
        className={TOP_MESSAGE_VIEWPORT_CLASS_NAME}
      />
    </RadixToast.Provider>
  );
}
