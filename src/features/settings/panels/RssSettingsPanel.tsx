import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { SettingsDraft } from '../../../store/settingsStore';
import type { RssSettings } from '../../../types';
import OpmlTransferSection, { type OpmlTransferResultSummary } from './OpmlTransferSection';

interface RssSettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
  opmlImporting?: boolean;
  opmlExporting?: boolean;
  lastOpmlImportResult?: OpmlTransferResultSummary | null;
  onOpmlImport?: (file: File) => void | Promise<void>;
  onOpmlExport?: () => void | Promise<void>;
}

export default function RssSettingsPanel({
  draft,
  onChange,
  opmlImporting = false,
  opmlExporting = false,
  lastOpmlImportResult = null,
  onOpmlImport = () => undefined,
  onOpmlExport = () => undefined,
}: RssSettingsPanelProps) {
  const rss = draft.persisted.rss;
  const globalKeywordsText = rss.articleKeywordFilter.globalKeywords.join('\n');

  const fetchIntervalOptions: Array<{ value: RssSettings['fetchIntervalMinutes']; label: string }> = [
    { value: 5, label: '每 5 分钟' },
    { value: 15, label: '每 15 分钟' },
    { value: 30, label: '每 30 分钟' },
    { value: 60, label: '每 1 小时' },
    { value: 120, label: '每 2 小时' },
  ];

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">RSS 抓取间隔</p>
              <p className="text-xs text-muted-foreground">全局设置，会应用到所有订阅源</p>
            </div>
            <div className="w-[140px]">
              <Select
                value={String(rss.fetchIntervalMinutes)}
                onValueChange={(value) => {
                  const next = Number(value);
                  if (next !== 5 && next !== 15 && next !== 30 && next !== 60 && next !== 120) return;
                  onChange((nextDraft) => {
                    nextDraft.persisted.rss.fetchIntervalMinutes = next;
                  });
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="选择间隔" />
                </SelectTrigger>
                <SelectContent>
                  {fetchIntervalOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={String(value)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="rss-global-article-keyword-filter" className="mb-2 block">
              全局关键词过滤
            </Label>
            <p className="mb-2 text-xs text-muted-foreground">
              每行输入一个关键词。只要标题或摘要包含该关键词，这篇文章就不会显示在列表中。
            </p>
            <Textarea
              id="rss-global-article-keyword-filter"
              aria-label="全局关键词过滤"
              value={globalKeywordsText}
              onChange={(event) => {
                const value = event.target.value;
                onChange((nextDraft) => {
                  nextDraft.persisted.rss.articleKeywordFilter.globalKeywords = value.split('\n');
                });
              }}
              placeholder={'广告\n招聘\nSponsored'}
              className="min-h-28"
            />
          </div>
        </div>
      </div>

      <OpmlTransferSection
        importing={opmlImporting}
        exporting={opmlExporting}
        lastImportResult={lastOpmlImportResult}
        onImport={onOpmlImport}
        onExport={onOpmlExport}
      />
    </section>
  );
}
