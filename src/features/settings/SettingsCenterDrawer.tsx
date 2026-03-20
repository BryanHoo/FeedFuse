import { Bot, Palette, Rss, ScrollText, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FROSTED_HEADER_CLASS_NAME,
  SETTINGS_CENTER_SHEET_CLASS_NAME,
} from '@/lib/designSystem';
import { exportOpml, importOpml } from '@/lib/apiClient';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import GeneralSettingsPanel from './panels/GeneralSettingsPanel';
import AISettingsPanel from './panels/AISettingsPanel';
import LogsSettingsPanel from './panels/LogsSettingsPanel';
import RssSettingsPanel from './panels/RssSettingsPanel';
import type { OpmlTransferResultSummary } from './panels/OpmlTransferSection';
import { useSettingsAutosave } from './useSettingsAutosave';
import { toast } from '../toast/toast';

interface SettingsCenterDrawerProps {
  onClose: () => void;
}

type SettingsSectionKey = 'general' | 'rss' | 'ai' | 'logging';

interface SettingsSectionItem {
  key: SettingsSectionKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const sectionItems: SettingsSectionItem[] = [
  { key: 'general', label: '通用', hint: '外观与阅读', icon: Palette },
  { key: 'rss', label: 'RSS', hint: '抓取与过滤', icon: Rss },
  { key: 'ai', label: 'AI', hint: '模型与接口', icon: Bot },
  { key: 'logging', label: '日志', hint: '开关与查看', icon: ScrollText },
];

const autosaveStatusMeta = {
  idle: {
    label: '未修改',
    toneClass: 'text-muted-foreground',
  },
  saving: {
    label: '保存中…',
    toneClass: 'text-warning',
  },
  saved: {
    label: '已保存',
    toneClass: 'text-success',
  },
  error: {
    label: '修复错误以保存',
    toneClass: 'text-error',
  },
} as const;

const settingsSectionTabClassName =
  'group relative min-w-[152px] justify-start rounded-lg border border-transparent bg-transparent px-3 py-2.5 text-left text-muted-foreground transition-colors hover:border-border/70 hover:bg-background/55 hover:text-foreground data-[state=active]:border-border/80 data-[state=active]:bg-background/78 data-[state=active]:text-foreground md:min-w-0 md:w-full md:px-3 md:py-3 md:pl-7 md:before:absolute md:before:inset-y-3 md:before:left-2 md:before:w-[3px] md:before:rounded-full md:before:content-[\'\'] md:data-[state=active]:before:bg-primary';

const settingsSectionIconClassName =
  'mt-0.5 shrink-0 text-muted-foreground transition-colors group-data-[state=active]:text-primary group-hover:text-foreground';

const settingsSectionLabelClassName =
  'text-sm font-medium text-foreground/90 transition-colors group-data-[state=active]:text-foreground group-hover:text-foreground';

const settingsSectionHintClassName =
  'text-xs text-muted-foreground transition-colors group-hover:text-foreground/80';

export default function SettingsCenterDrawer({ onClose }: SettingsCenterDrawerProps) {
  const [draftVersion, setDraftVersion] = useState(0);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('general');
  const [opmlImporting, setOpmlImporting] = useState(false);
  const [opmlExporting, setOpmlExporting] = useState(false);
  const [lastOpmlImportResult, setLastOpmlImportResult] =
    useState<OpmlTransferResultSummary | null>(null);
  const lastAutosaveStatusRef = useRef<keyof typeof autosaveStatusMeta>('idle');
  const lastSavedNotifyAtRef = useRef(0);
  const draft = useSettingsStore((state) => state.draft);
  const hydratePersistedSettings = useSettingsStore((state) => state.hydratePersistedSettings);
  const loadDraft = useSettingsStore((state) => state.loadDraft);
  const updateDraft = useSettingsStore((state) => state.updateDraft);
  const saveDraft = useSettingsStore((state) => state.saveDraft);
  const discardDraft = useSettingsStore((state) => state.discardDraft);
  const validationErrors = useSettingsStore((state) => state.validationErrors);
  const validationErrorKeys = Object.keys(validationErrors);
  const hasErrors = validationErrorKeys.length > 0;
  const autosave = useSettingsAutosave({
    draftVersion,
    saveDraft,
    hasErrors,
  });

  useEffect(() => {
    const previous = lastAutosaveStatusRef.current;
    const current = autosave.status;

    if (current === 'saved' && previous !== 'saved') {
      const now = Date.now();
      if (now - lastSavedNotifyAtRef.current >= 30000) {
        toast.success('设置已自动保存');
        lastSavedNotifyAtRef.current = now;
      }
    }

    lastAutosaveStatusRef.current = current;
  }, [autosave.status]);

  useEffect(() => {
    void (async () => {
      await hydratePersistedSettings();
      loadDraft();
    })();
  }, [hydratePersistedSettings, loadDraft]);


  const forceClose = () => {
    discardDraft();
    onClose();
  };

  const handleDraftChange = (updater: Parameters<typeof updateDraft>[0]) => {
    updateDraft((nextDraft) => {
      updater(nextDraft);
    });
    setDraftVersion((value) => value + 1);
  };

  const currentStatusMeta = autosaveStatusMeta[autosave.status];
  const hasBlockingState = autosave.status === 'saving' || autosave.status === 'error' || hasErrors;
  const sectionErrors: Record<SettingsSectionKey, number> = {
    general: validationErrorKeys.filter((field) => field.startsWith('general.')).length,
    rss: validationErrorKeys.filter((field) => field.startsWith('rss.')).length,
    ai: validationErrorKeys.filter((field) => field.startsWith('ai.')).length,
    logging: 0,
  };

  const requestClose = () => {
    if (hasBlockingState) {
      setCloseConfirmOpen(true);
      return;
    }

    forceClose();
  };

  const handleOpmlImport = async (file: File) => {
    setOpmlImporting(true);

    try {
      const content = await file.text();
      const result = await importOpml({ content, fileName: file.name });
      setLastOpmlImportResult(result);
      toast.success('OPML 导入完成');
      await useAppStore.getState().loadSnapshot({ view: useAppStore.getState().selectedView });
    } finally {
      setOpmlImporting(false);
    }
  };

  const handleOpmlExport = async () => {
    setOpmlExporting(true);

    let objectUrl: string | null = null;
    try {
      const result = await exportOpml();
      const blob = new Blob([result.xml], { type: 'application/xml;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);

      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = result.fileName;
      anchor.click();

      toast.success('OPML 已开始下载');
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      setOpmlExporting(false);
    }
  };

  return (
    <>
      <Sheet
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            requestClose();
          }
        }}
      >
        <SheetContent
          side="right"
          className={SETTINGS_CENTER_SHEET_CLASS_NAME}
          data-testid="settings-center-modal"
          closeLabel="关闭设置"
          overlayProps={{ 'data-testid': 'settings-center-overlay' }}
        >
          <div className="flex h-full flex-col">
            <div className={cn('flex items-center justify-between px-4 py-4 md:px-6', FROSTED_HEADER_CLASS_NAME)}>
              <div className="flex items-center gap-3">
                <SheetTitle className="text-base font-semibold">
                  设置
                </SheetTitle>
                <span
                  role="status"
                  aria-live="polite"
                  className={cn('text-xs', currentStatusMeta.toneClass)}
                >
                  {currentStatusMeta.label}
                </span>
              </div>
              <SheetDescription className="sr-only">FeedFuse 设置中心</SheetDescription>
            </div>

            {draft ? (
              <Tabs
                value={activeSection}
                onValueChange={(value) => setActiveSection(value as SettingsSectionKey)}
                className="min-h-0 flex-1"
              >
                <div className="flex h-full min-h-0 flex-col md:flex-row">
                  <aside className="border-b border-border/70 bg-muted/40 backdrop-blur md:w-60 md:shrink-0 md:border-b-0 md:border-r supports-[backdrop-filter]:bg-muted/30">
                    <TabsList
                      aria-label="设置导航"
                      className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent px-3 py-4 text-muted-foreground md:flex-col md:items-stretch md:gap-1.5 md:overflow-visible md:px-3 md:py-5"
                    >
                      {sectionItems.map(({ key, label, hint, icon: Icon }) => {
                        const errorCount = sectionErrors[key];

                        return (
                          <TabsTrigger
                            key={key}
                            value={key}
                            data-testid={`settings-section-tab-${key}`}
                            onClick={() => setActiveSection(key)}
                            className={settingsSectionTabClassName}
                          >
                            <div className="flex w-full items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5">
                                <Icon
                                  size={16}
                                  aria-hidden="true"
                                  className={settingsSectionIconClassName}
                                />
                                <div>
                                  <p className={settingsSectionLabelClassName}>{label}</p>
                                  <p className={settingsSectionHintClassName}>{hint}</p>
                                </div>
                              </div>
                              {errorCount > 0 ? (
                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[11px] font-semibold text-error-foreground">
                                  {errorCount}
                                </span>
                              ) : null}
                            </div>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </aside>

                  <div className="min-h-0 min-w-0 flex-1 px-4 py-5 md:px-6 md:py-6">
                    <div className="flex h-full min-h-0 w-full flex-col">
                      <TabsContent value="general" className="mt-0 h-full overflow-y-auto">
                        <GeneralSettingsPanel draft={draft} onChange={handleDraftChange} />
                      </TabsContent>
                      <TabsContent value="rss" className="mt-0 h-full overflow-y-auto">
                        <RssSettingsPanel
                          draft={draft}
                          onChange={handleDraftChange}
                          opmlImporting={opmlImporting}
                          opmlExporting={opmlExporting}
                          lastOpmlImportResult={lastOpmlImportResult}
                          onOpmlImport={handleOpmlImport}
                          onOpmlExport={handleOpmlExport}
                        />
                      </TabsContent>
                      <TabsContent value="ai" className="mt-0 h-full overflow-y-auto">
                        <AISettingsPanel draft={draft} onChange={handleDraftChange} errors={validationErrors} />
                      </TabsContent>
                      <TabsContent value="logging" className="mt-0 h-full min-h-0">
                        <LogsSettingsPanel draft={draft} onChange={handleDraftChange} />
                      </TabsContent>
                    </div>
                  </div>
                </div>
              </Tabs>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认关闭</AlertDialogTitle>
            <AlertDialogDescription>关闭后会丢失未成功保存的修改</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            请先修复错误，或确认放弃这些修改。
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCloseConfirmOpen(false);
                forceClose();
              }}
            >
              确认关闭
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
