import type { SystemLogItem } from '../../../../types';
import { LogListItem } from './LogListItem';

interface LogListProps {
  items: SystemLogItem[];
  keyword: string;
  loading: boolean;
  loadError: string | null;
  expandedLogId: string | null;
  onToggleExpand: (id: string) => void;
}

export function LogList({
  items,
  keyword,
  loading,
  loadError,
  expandedLogId,
  onToggleExpand,
}: LogListProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3.5">
      {loading ? (
        <p className="text-sm text-muted-foreground">日志加载中…</p>
      ) : null}

      {!loading && loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{keyword ? '没有匹配的日志' : '暂无日志'}</p>
      ) : null}

      {!loading && !loadError && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <LogListItem
              key={item.id}
              item={item}
              expanded={expandedLogId === item.id}
              onToggle={() => onToggleExpand(item.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
