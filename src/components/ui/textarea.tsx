'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-24 w-full rounded-md border border-input/90 bg-[color-mix(in_oklab,var(--color-background)_88%,white_12%)] px-3 py-2 text-sm transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(13,13,17,0.98),rgba(9,9,12,0.94))] dark:text-foreground dark:placeholder:text-muted-foreground/75 dark:focus-visible:border-[rgba(94,106,210,0.38)] dark:focus-visible:ring-[rgba(94,106,210,0.12)]',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export { Textarea };
