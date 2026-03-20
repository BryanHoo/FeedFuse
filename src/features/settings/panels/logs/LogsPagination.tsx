import { Button } from '@/components/ui/button';

interface LogsPaginationProps {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function LogsPagination({
  page,
  totalPages,
  onPrevious,
  onNext,
}: LogsPaginationProps) {
  if (totalPages <= 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <Button type="button" variant="outline" size="compact" disabled={page <= 1} onClick={onPrevious}>
        上一页
      </Button>
      <p className="text-xs text-muted-foreground">第 {page} 页，共 {totalPages} 页</p>
      <Button
        type="button"
        variant="outline"
        size="compact"
        disabled={page >= totalPages}
        onClick={onNext}
      >
        下一页
      </Button>
    </div>
  );
}
