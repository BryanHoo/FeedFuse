'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SettingsDraft } from '../../../store/settingsStore';
import type { GeneralSettings } from '../../../types';

interface GeneralSettingsPanelProps {
  draft: SettingsDraft;
  onChange: (updater: (draft: SettingsDraft) => void) => void;
}

export default function GeneralSettingsPanel({ draft, onChange }: GeneralSettingsPanelProps) {
  const general = draft.persisted.general;

  const themeOptions: Array<{ value: GeneralSettings['theme']; label: string; icon: typeof Sun }> = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'auto', label: '自动', icon: Monitor },
  ];

  const fontSizeOptions: Array<{ value: GeneralSettings['fontSize']; label: string }> = [
    { value: 'small', label: '小' },
    { value: 'medium', label: '中' },
    { value: 'large', label: '大' },
  ];

  const fontFamilyOptions: Array<{ value: GeneralSettings['fontFamily']; label: string }> = [
    { value: 'sans', label: '无衬线' },
    { value: 'serif', label: '衬线' },
  ];

  const lineHeightOptions: Array<{ value: GeneralSettings['lineHeight']; label: string }> = [
    { value: 'compact', label: '紧凑' },
    { value: 'normal', label: '标准' },
    { value: 'relaxed', label: '宽松' },
  ];

  const autoMarkReadDelayOptions: Array<{ value: GeneralSettings['autoMarkReadDelayMs']; label: string }> = [
    { value: 0, label: '立即' },
    { value: 2000, label: '2 秒' },
    { value: 5000, label: '5 秒' },
  ];

  return (
    <section>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex flex-col divide-y divide-border">
          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">主题</p>
              <p className="text-xs text-muted-foreground">选择界面配色方案</p>
            </div>
            <div className="flex gap-1.5">
              {themeOptions.map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.theme = value;
                    })
                  }
                  aria-pressed={general.theme === value}
                  variant={general.theme === value ? 'default' : 'outline'}
                  size="compact"
                  className="gap-1.5 px-2.5"
                  title={label}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">字体大小</p>
              <p className="text-xs text-muted-foreground">调整文章阅读字号</p>
            </div>
            <div className="flex gap-1">
              {fontSizeOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.fontSize = value;
                    })
                  }
                  aria-pressed={general.fontSize === value}
                  variant={general.fontSize === value ? 'default' : 'outline'}
                  size="compact"
                  className="w-12 px-0"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">字体风格</p>
              <p className="text-xs text-muted-foreground">选择文章字体样式</p>
            </div>
            <div className="flex gap-1">
              {fontFamilyOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.fontFamily = value;
                    })
                  }
                  aria-pressed={general.fontFamily === value}
                  variant={general.fontFamily === value ? 'default' : 'outline'}
                  size="compact"
                  className="w-16 px-0"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">行高</p>
              <p className="text-xs text-muted-foreground">调整文章行间距</p>
            </div>
            <div className="flex gap-1">
              {lineHeightOptions.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.lineHeight = value;
                    })
                  }
                  aria-pressed={general.lineHeight === value}
                  variant={general.lineHeight === value ? 'default' : 'outline'}
                  size="compact"
                  className="w-14 px-0"
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">自动标记已读</p>
              <p className="text-xs text-muted-foreground">打开文章后，按设定时间自动标记为已读</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex gap-1">
                <Button
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.autoMarkReadEnabled = false;
                    })
                  }
                  aria-pressed={!general.autoMarkReadEnabled}
                  variant={!general.autoMarkReadEnabled ? 'default' : 'outline'}
                  size="compact"
                  className="w-[88px] px-0"
                >
                  手动标记
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    onChange((nextDraft) => {
                      nextDraft.persisted.general.autoMarkReadEnabled = true;
                    })
                  }
                  aria-pressed={general.autoMarkReadEnabled}
                  variant={general.autoMarkReadEnabled ? 'default' : 'outline'}
                  size="compact"
                  className="w-[88px] px-0"
                >
                  自动标记
                </Button>
              </div>

              <Select
                value={String(general.autoMarkReadDelayMs)}
                onValueChange={(value) => {
                  const next = Number(value);
                  if (next !== 0 && next !== 2000 && next !== 5000) return;
                  onChange((nextDraft) => {
                    nextDraft.persisted.general.autoMarkReadDelayMs = next;
                  });
                }}
                disabled={!general.autoMarkReadEnabled}
              >
                <SelectTrigger className="h-8 w-[110px]">
                  <SelectValue placeholder="标记时间" />
                </SelectTrigger>
                <SelectContent>
                  {autoMarkReadDelayOptions.map(({ value, label }) => (
                    <SelectItem key={value} value={String(value)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3.5">
            <div>
              <p className="text-sm font-medium text-foreground">默认仅未读</p>
              <p className="text-xs text-muted-foreground">进入全部文章或任意 RSS 源时，默认只显示未读文章</p>
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                onClick={() =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.general.defaultUnreadOnlyInAll = false;
                  })
                }
                aria-pressed={!general.defaultUnreadOnlyInAll}
                variant={!general.defaultUnreadOnlyInAll ? 'default' : 'outline'}
                size="compact"
                className="w-[88px] px-0"
              >
                全部文章
              </Button>
              <Button
                type="button"
                onClick={() =>
                  onChange((nextDraft) => {
                    nextDraft.persisted.general.defaultUnreadOnlyInAll = true;
                  })
                }
                aria-pressed={general.defaultUnreadOnlyInAll}
                variant={general.defaultUnreadOnlyInAll ? 'default' : 'outline'}
                size="compact"
                className="w-[88px] px-0"
              >
                仅看未读
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
