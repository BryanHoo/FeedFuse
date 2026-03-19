import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getSystemLogs } from '@/lib/apiClient';
import type { SettingsDraft } from '../../../store/settingsStore';
import type { LoggingRetentionDays, SystemLogItem, SystemLogLevel } from '../../../types';

interface LogsSettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
  initialLogs?: SystemLogItem[];
  initialNextCursor?: string | null;
  initialHasMore?: boolean;
}

type LogFilterLevel = 'all' | SystemLogLevel;

const retentionDayOptions: LoggingRetentionDays[] = [1, 3, 7, 14, 30, 90];
const levelOptions: LogFilterLevel[] = ['all', 'info', 'warning', 'error'];

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

function renderLogDetails(details: string | null) {
  if (!details) {
    return null;
  }

  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 text-xs text-foreground/80">
      {details}
    </pre>
  );
}

export default function LogsSettingsPanel({
  draft,
  onChange,
  initialLogs,
  initialNextCursor = null,
  initialHasMore = false,
}: LogsSettingsPanelProps) {
  const logging = draft.persisted.logging;
  const [level, setLevel] = useState<LogFilterLevel>('all');
  const [items, setItems] = useState<SystemLogItem[]>(() => initialLogs ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(initialLogs === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function loadLogs(input: {
    level: LogFilterLevel;
    before: string | null;
    append: boolean;
  }) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (input.append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setItems([]);
      setNextCursor(null);
      setHasMore(false);
    }
    setLoadError(null);

    try {
      const data = await getSystemLogs({
        level: input.level === 'all' ? undefined : input.level,
        before: input.before,
        limit: 50,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setItems((current) => (input.append ? [...current, ...data.items] : data.items));
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setLoadError(err instanceof Error ? err.message : '加载日志失败');
      if (!input.append) {
        setItems([]);
        setNextCursor(null);
        setHasMore(false);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (initialLogs !== undefined) {
      return;
    }

    void loadLogs({ level: 'all', before: null, append: false });
  }, [initialLogs]);

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">记录系统日志</p>
              <p className="text-xs text-muted-foreground">控制第三方请求与关键任务日志是否写入数据库</p>
            </div>
            <Switch
              aria-label="启用日志记录"
              checked={logging.enabled}
              onCheckedChange={(checked) =>
                onChange((nextDraft) => {
                  nextDraft.persisted.logging.enabled = checked;
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">日志保留天数</p>
              <p className="text-xs text-muted-foreground">超过保留期的日志会由后台任务自动清理</p>
            </div>
            <div className="w-[132px]">
              <Select
                value={String(logging.retentionDays)}
                onValueChange={(value) => {
                  const next = Number(value) as LoggingRetentionDays;
                  if (!retentionDayOptions.includes(next)) {
                    return;
                  }

                  onChange((nextDraft) => {
                    nextDraft.persisted.logging.retentionDays = next;
                  });
                }}
              >
                <SelectTrigger className="h-8" aria-label="日志保留天数">
                  <SelectValue placeholder="选择天数" />
                </SelectTrigger>
                <SelectContent>
                  {retentionDayOptions.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} 天
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">日志记录</p>
              <p className="text-xs text-muted-foreground">按等级筛选最近的系统日志</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {levelOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="compact"
                  variant={level === option ? 'default' : 'outline'}
                  className="min-w-14 px-3 lowercase"
                  onClick={() => {
                    setLevel(option);
                    void loadLogs({ level: option, before: null, append: false });
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3 px-4 py-3.5">
          {loading ? (
            <p className="text-sm text-muted-foreground">日志加载中…</p>
          ) : null}

          {!loading && loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}

          {!loading && !loadError && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无日志</p>
          ) : null}

          {items.map((item) => (
            <article
              key={item.id}
              className="rounded-lg border border-border/70 bg-muted/20 p-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{item.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.level} · {item.category} · {item.source}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatLogTime(item.createdAt)}
                </time>
              </div>

              {Object.keys(item.context).length > 0 ? (
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-3 text-xs text-foreground/80">
                  {JSON.stringify(item.context, null, 2)}
                </pre>
              ) : null}

              {item.details ? <div className="mt-3">{renderLogDetails(item.details)}</div> : null}
            </article>
          ))}

          {!loading && hasMore ? (
            <div className="flex justify-center pt-1">
              <Button
                type="button"
                variant="outline"
                size="compact"
                disabled={loadingMore || !nextCursor}
                onClick={() => {
                  if (!nextCursor) {
                    return;
                  }

                  void loadLogs({ level, before: nextCursor, append: true });
                }}
              >
                {loadingMore ? '加载中…' : '加载更多'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
