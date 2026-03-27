'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium transition-[background-color,color,border-color,box-shadow,transform,filter] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-[linear-gradient(135deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_72%,white_28%))] text-primary-foreground hover:-translate-y-0.5 hover:brightness-[1.03] dark:border-[rgba(94,106,210,0.34)] dark:bg-[linear-gradient(135deg,color-mix(in_oklab,var(--color-primary)_94%,black_6%),color-mix(in_oklab,var(--color-primary)_76%,white_24%))] dark:text-primary-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:-translate-y-0.5 hover:bg-destructive/92',
        outline:
          'border-border/80 bg-background/90 text-foreground hover:-translate-y-px hover:border-primary/20 hover:bg-accent/90 hover:text-accent-foreground dark:border-white/[0.07] dark:bg-[linear-gradient(180deg,rgba(14,14,18,0.96),rgba(10,10,13,0.92))] dark:text-foreground dark:hover:border-[rgba(94,106,210,0.24)] dark:hover:bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card)_90%)]',
        secondary:
          'border-border/70 bg-[color-mix(in_oklab,var(--color-secondary)_78%,white_22%)] text-secondary-foreground hover:-translate-y-px hover:border-primary/18 hover:bg-[color-mix(in_oklab,var(--color-accent)_58%,white_42%)] dark:border-white/[0.05] dark:bg-[linear-gradient(180deg,rgba(13,13,17,0.96),rgba(9,9,12,0.92))] dark:text-foreground dark:hover:border-[rgba(94,106,210,0.18)] dark:hover:bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card)_92%)]',
        ghost:
          'text-muted-foreground hover:bg-accent/90 hover:text-foreground dark:text-muted-foreground dark:hover:bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card)_90%)] dark:hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:text-primary/88 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 rounded-md px-2 text-xs',
        compact: 'h-8 rounded-md px-3 text-sm',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean;
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Button.displayName = 'Button';

export { Button, buttonVariants };
