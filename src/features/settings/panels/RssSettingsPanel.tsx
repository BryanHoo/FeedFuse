import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  const globalKeywordsText = rss.articleFilter.keyword.keywords.join('\n');
  const aiPrompt = rss.articleFilter.ai.prompt;

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
              对之后新入库的文章生效。先做标题和摘要关键词预过滤，命中后直接标记为已过滤。
            </p>
            <div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">启用关键词过滤</p>
                <p className="text-xs text-muted-foreground">关闭后会保留关键词列表，但不再用于新文章过滤。</p>
              </div>
              <Switch
                id="rss-article-filter-keyword-enabled"
                aria-label="启用关键词过滤"
                checked={rss.articleFilter.keyword.enabled}
                onCheckedChange={(checked) => {
                  onChange((nextDraft) => {
                    nextDraft.persisted.rss.articleFilter.keyword.enabled = checked;
                  });
                }}
              />
            </div>
            <Textarea
              id="rss-global-article-keyword-filter"
              aria-label="全局关键词过滤"
              value={globalKeywordsText}
              onChange={(event) => {
                const value = event.target.value;
                onChange((nextDraft) => {
                  nextDraft.persisted.rss.articleFilter.keyword.keywords = value.split('\n');
                });
              }}
              placeholder={'广告\n招聘\nSponsored'}
              className="min-h-28"
            />
          </div>

          <div className="px-4 py-3.5">
            <Label htmlFor="rss-ai-article-filter-prompt" className="mb-2 block">
              AI 过滤提示词
            </Label>
            <p className="mb-2 text-xs text-muted-foreground">
              对关键词未命中的新文章追加 AI 过滤判断。提示词应描述什么内容应该被过滤。
            </p>
            <div className="mb-3 flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">启用 AI 过滤</p>
                <p className="text-xs text-muted-foreground">AI 判断失败时会回退为错误状态，不会误杀文章。</p>
              </div>
              <Switch
                id="rss-article-filter-ai-enabled"
                aria-label="启用 AI 过滤"
                checked={rss.articleFilter.ai.enabled}
                onCheckedChange={(checked) => {
                  onChange((nextDraft) => {
                    nextDraft.persisted.rss.articleFilter.ai.enabled = checked;
                  });
                }}
              />
            </div>
            <Textarea
              id="rss-ai-article-filter-prompt"
              aria-label="AI 过滤提示词"
              value={aiPrompt}
              onChange={(event) => {
                const value = event.target.value;
                onChange((nextDraft) => {
                  nextDraft.persisted.rss.articleFilter.ai.prompt = value;
                });
              }}
              placeholder="例如：过滤广告、招聘、软文、促销或与我关注主题无关的内容。"
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
