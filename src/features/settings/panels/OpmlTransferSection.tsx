import { Upload, Download } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';

export interface OpmlTransferResultSummary {
  importedCount: number;
  duplicateCount: number;
  invalidCount: number;
  createdCategoryCount: number;
}

interface OpmlTransferSectionProps {
  importing: boolean;
  exporting: boolean;
  lastImportResult: OpmlTransferResultSummary | null;
  onImport: (file: File) => void | Promise<void>;
  onExport: () => void | Promise<void>;
}

export default function OpmlTransferSection({
  importing,
  exporting,
  lastImportResult,
  onImport,
  onExport,
}: OpmlTransferSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-4 px-4 py-3.5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">OPML 导入与导出</p>
          <p className="text-xs text-muted-foreground">
            导入 OPML 以批量恢复订阅与分类，或导出当前订阅备份。
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            aria-label="导入 OPML"
            disabled={importing}
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <Upload aria-hidden="true" />
            {importing ? '导入中…' : '导入 OPML'}
          </Button>

          <input
            ref={fileInputRef}
            data-testid="opml-file-input"
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) {
                return;
              }

              void onImport(file);
              event.currentTarget.value = '';
            }}
          />

          <Button
            type="button"
            variant="outline"
            aria-label="导出 OPML"
            disabled={exporting}
            onClick={() => {
              void onExport();
            }}
          >
            <Download aria-hidden="true" />
            {exporting ? '导出中…' : '导出 OPML'}
          </Button>
        </div>

        {lastImportResult ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border border-border/80 bg-accent/30 px-3 py-3 text-sm text-foreground"
          >
            <p>已导入 {lastImportResult.importedCount} 个订阅</p>
            <p>已跳过 {lastImportResult.duplicateCount} 个重复订阅</p>
            <p>已跳过 {lastImportResult.invalidCount} 个无效条目</p>
            <p>已创建 {lastImportResult.createdCategoryCount} 个分类</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            还没有导入记录。选择 OPML 文件后，这里会展示最近一次导入摘要。
          </p>
        )}
      </div>
    </section>
  );
}
