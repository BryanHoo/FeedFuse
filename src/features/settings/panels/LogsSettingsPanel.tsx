import { useEffect, useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { getSystemLogs } from '@/lib/apiClient';
import type { SettingsDraft } from '../../../store/settingsStore';
import type { LoggingRetentionDays, SystemLogLevel, SystemLogsPage } from '../../../types';
import { LogList } from './logs/LogList';
import { LogSearchBar } from './logs/LogSearchBar';
import { LogsPagination } from './logs/LogsPagination';

interface LogsSettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
  initialLogsPage?: SystemLogsPage;
}

const LOGS_PAGE_SIZE = 20;
const retentionDayOptions: LoggingRetentionDays[] = [1, 3, 7, 14, 30, 90];
const minLevelOptions: Array<{ value: SystemLogLevel; label: string }> = [
  { value: 'info', label: '记录全部（info 及以上）' },
  { value: 'warning', label: '仅警告和错误（warning 及以上）' },
  { value: 'error', label: '仅错误（error）' },
];

function createEmptyLogsPage(page = 1, pageSize = LOGS_PAGE_SIZE): SystemLogsPage {
  return {
    items: [],
    page,
    pageSize,
    total: 0,
    hasPreviousPage: page > 1,
    hasNextPage: false,
  };
}

export default function LogsSettingsPanel({
  draft,
  onChange,
  initialLogsPage,
}: LogsSettingsPanelProps) {
  const logging = draft.persisted.logging;
  const [logsPage, setLogsPage] = useState<SystemLogsPage>(() => initialLogsPage ?? createEmptyLogsPage());
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(initialLogsPage?.page ?? 1);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialLogsPage === undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const skipInitialLoadRef = useRef(initialLogsPage !== undefined);

  async function loadLogs(input: { keyword?: string; page: number }) {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    setLogsPage(createEmptyLogsPage(input.page));

    try {
      const data = await getSystemLogs({
        keyword: input.keyword,
        page: input.page,
        pageSize: LOGS_PAGE_SIZE,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setLogsPage(data);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setLoadError(err instanceof Error ? err.message : '加载日志失败');
      setLogsPage(createEmptyLogsPage(input.page));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const nextKeyword = keywordInput.trim();
    if (nextKeyword === keyword) {
      return;
    }

    const timer = window.setTimeout(() => {
      setKeyword(nextKeyword);
      setPage(1);
      setExpandedLogId(null);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [keywordInput, keyword]);

  useEffect(() => {
    if (skipInitialLoadRef.current) {
      skipInitialLoadRef.current = false;
      return;
    }

    void loadLogs({ keyword: keyword || undefined, page });
  }, [keyword, page]);

  const totalPages = logsPage.total > 0 ? Math.ceil(logsPage.total / logsPage.pageSize) : 0;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4">
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

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">记录类型</p>
              <p className="text-xs text-muted-foreground">控制写入数据库的最低日志等级</p>
            </div>
            <div className="w-[220px]">
              <Select
                value={logging.minLevel}
                onValueChange={(value) => {
                  const next = value as SystemLogLevel;
                  if (!minLevelOptions.some((option) => option.value === next)) {
                    return;
                  }

                  onChange((nextDraft) => {
                    nextDraft.persisted.logging.minLevel = next;
                  });
                }}
              >
                <SelectTrigger className="h-8" aria-label="日志记录类型">
                  <SelectValue placeholder="选择记录类型" />
                </SelectTrigger>
                <SelectContent>
                  {minLevelOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
        <div className="border-b border-border px-4 py-3.5">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">日志记录</p>
            <p className="text-xs text-muted-foreground">按关键词搜索摘要字段，并在固定页中浏览日志详情</p>
          </div>
        </div>

        <div className="border-b border-border px-4 py-3.5">
          <LogSearchBar
            keyword={keywordInput}
            total={logsPage.total}
            page={logsPage.page}
            totalPages={totalPages}
            onKeywordChange={setKeywordInput}
          />
        </div>

        <LogList
          items={logsPage.items}
          keyword={keyword}
          loading={loading}
          loadError={loadError}
          expandedLogId={expandedLogId}
          onToggleExpand={(id) => {
            setExpandedLogId((current) => (current === id ? null : id));
          }}
        />

        {!loading && !loadError && logsPage.total > 0 ? (
          <div className="border-t border-border px-4 py-3.5">
            <LogsPagination
              page={logsPage.page}
              totalPages={totalPages}
              onPrevious={() => {
                if (!logsPage.hasPreviousPage) {
                  return;
                }

                setExpandedLogId(null);
                setPage((current) => Math.max(1, current - 1));
              }}
              onNext={() => {
                if (!logsPage.hasNextPage) {
                  return;
                }

                setExpandedLogId(null);
                setPage((current) => current + 1);
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
