import { useState, type ComponentType } from 'react';
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
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const visualTooltipLabel = Array.from(label).join('\u2060');
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        'h-6 w-6 cursor-pointer text-muted-foreground',
        pressed && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
        className,
      )}
      aria-label={label}
      aria-pressed={pressed || undefined}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
    >
      <Icon className={cn('h-3.5 w-3.5', iconClassName)} />
    </Button>
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
        <TooltipTrigger asChild>
          <span
            className="inline-flex"
            onMouseEnter={() => setTooltipOpen(true)}
            onMouseLeave={() => setTooltipOpen(false)}
          >
            {button}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" aria-label={label}>
          <span aria-hidden="true">{visualTooltipLabel}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
