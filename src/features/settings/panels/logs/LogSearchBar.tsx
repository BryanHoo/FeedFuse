import { Input } from '@/components/ui/input';

export interface LogSearchBarProps {
  keyword: string;
  total: number;
  page: number;
  totalPages: number;
  onKeywordChange: (value: string) => void;
}

export function LogSearchBar(props: LogSearchBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <Input
        aria-label="搜索日志"
        value={props.keyword}
        onChange={(event) => props.onKeywordChange(event.target.value)}
        placeholder="搜索 message、source、category"
      />
      <p className="shrink-0 text-xs text-muted-foreground">
        共 {props.total} 条 · 第 {props.page} / {Math.max(props.totalPages, 1)} 页
      </p>
    </div>
  );
}
