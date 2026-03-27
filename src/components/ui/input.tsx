'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input/90 bg-[color-mix(in_oklab,var(--color-background)_88%,white_12%)] px-3 py-1 text-base transition-[background-color,border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:outline-none focus-visible:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-[linear-gradient(180deg,rgba(13,13,17,0.98),rgba(9,9,12,0.94))] dark:text-foreground dark:placeholder:text-muted-foreground/75 dark:focus-visible:border-[rgba(94,106,210,0.38)] dark:focus-visible:ring-[rgba(94,106,210,0.12)] md:text-sm',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
