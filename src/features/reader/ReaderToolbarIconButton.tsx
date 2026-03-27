import { type ComponentType } from 'react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ReaderToolbarIconButtonProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  iconClassName?: string;
};

export default function ReaderToolbarIconButton({
  icon: Icon,
  label,
  pressed = false,
  disabled = false,
  onClick,
  className,
  iconClassName,
}: ReaderToolbarIconButtonProps) {
  const visualTooltipLabel = Array.from(label).join('\u2060');
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-6 w-6 cursor-pointer text-muted-foreground',
        pressed &&
          'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-white/[0.06] dark:bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-card)_88%)] dark:text-foreground dark:hover:bg-[color-mix(in_oklab,var(--color-primary)_16%,var(--color-card)_84%)]',
        className,
      )}
      aria-label={label}
      aria-pressed={pressed || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
    </Button>
  );
  const trigger = disabled ? <span className="inline-flex">{button}</span> : button;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip disableHoverableContent>
        <TooltipTrigger asChild>
          {trigger}
        </TooltipTrigger>
        <TooltipContent side="bottom" aria-label={label}>
          <span aria-hidden="true">{visualTooltipLabel}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
