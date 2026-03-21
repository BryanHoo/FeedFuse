import { Input } from '@/components/ui/input';

export interface LogSearchBarProps {
  keyword: string;
  onKeywordChange: (value: string) => void;
}

export function LogSearchBar(props: LogSearchBarProps) {
  return (
    <div>
      <Input
        aria-label="搜索日志"
        value={props.keyword}
        onChange={(event) => props.onKeywordChange(event.target.value)}
        placeholder="例如：message、source 或 category…"
      />
    </div>
  );
}
