import { cn } from '@/lib/utils';
import type { SystemLogItem, SystemLogLevel } from '../../../../types';

interface LogListItemProps {
  item: SystemLogItem;
  expanded: boolean;
  onToggle: () => void;
}

const logLevelTone: Record<
  SystemLogLevel,
  { containerClass: string; accentClass: string; metaClass: string }
> = {
  info: {
    containerClass: 'border-primary/20 bg-primary/5',
    accentClass: 'bg-primary/70',
    metaClass: 'text-primary',
  },
  warning: {
    containerClass: 'border-warning/30 bg-warning/10',
    accentClass: 'bg-warning',
    metaClass: 'text-warning',
  },
  error: {
    containerClass: 'border-error/30 bg-error/10',
    accentClass: 'bg-error',
    metaClass: 'text-error',
  },
};

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function LogListItem({ item, expanded, onToggle }: LogListItemProps) {
  const tone = logLevelTone[item.level];

  return (
    <article className={cn('overflow-hidden rounded-lg border', tone.containerClass)}>
      <button
        type="button"
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={cn('mt-0.5 h-9 w-1 shrink-0 rounded-full', tone.accentClass)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{item.message}</p>
          <p className={cn('mt-1 text-xs', tone.metaClass)}>
            {item.level} · {item.category} · {item.source}
          </p>
        </div>
        <time className="shrink-0 text-xs text-muted-foreground">{formatLogTime(item.createdAt)}</time>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border/60 px-4 pb-4 pt-3">
          {item.details ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs text-foreground/80">
              {item.details}
            </pre>
          ) : null}
          {Object.keys(item.context).length > 0 ? (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 text-xs text-foreground/80">
              {JSON.stringify(item.context, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
