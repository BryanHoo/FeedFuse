import { Bot, Palette, Rss, type LucideIcon } from 'lucide-react';
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
import RssSettingsPanel from './panels/RssSettingsPanel';
import type { OpmlTransferResultSummary } from './panels/OpmlTransferSection';
import { useSettingsAutosave } from './useSettingsAutosave';
import { toast } from '../toast/toast';

interface SettingsCenterDrawerProps {
  onClose: () => void;
}

type SettingsSectionKey = 'general' | 'rss' | 'ai';

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
  'group relative min-w-[152px] justify-start rounded-2xl border border-transparent bg-transparent px-3 py-2.5 text-left text-muted-foreground transition-colors hover:border-border/80 hover:bg-accent/60 hover:text-foreground data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm md:min-w-0 md:w-full md:px-3 md:py-3 md:pl-7 md:before:absolute md:before:inset-y-3 md:before:left-2 md:before:w-[3px] md:before:rounded-full md:before:content-[\'\'] md:data-[state=active]:before:bg-primary';

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
  const selectedView = useAppStore((state) => state.selectedView);
  const lastAutosaveStatusRef = useRef<keyof typeof autosaveStatusMeta>('idle');
  const lastSavedNotifyAtRef = useRef(0);
  const pendingKeywordReloadRef = useRef(false);
  const persistedGlobalKeywords = useSettingsStore(
    (state) => state.persistedSettings.rss.articleKeywordFilter.globalKeywords,
  );
  const lastSavedKeywordSignatureRef = useRef(JSON.stringify(persistedGlobalKeywords));
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


  useEffect(() => {
    if (autosave.status !== 'saved') {
      return;
    }

    const persistedKeywordSignature = JSON.stringify(persistedGlobalKeywords);
    const keywordsChangedSinceLastSave =
      persistedKeywordSignature !== lastSavedKeywordSignatureRef.current;
    lastSavedKeywordSignatureRef.current = persistedKeywordSignature;

    if (!pendingKeywordReloadRef.current || !keywordsChangedSinceLastSave) {
      if (!keywordsChangedSinceLastSave) {
        pendingKeywordReloadRef.current = false;
      }
      return;
    }

    pendingKeywordReloadRef.current = false;
    void useAppStore.getState().loadSnapshot({ view: selectedView });
  }, [autosave.status, persistedGlobalKeywords, selectedView]);

  const forceClose = () => {
    discardDraft();
    onClose();
  };

  const handleDraftChange = (updater: Parameters<typeof updateDraft>[0]) => {
    const currentKeywordSignature = JSON.stringify(
      useSettingsStore.getState().draft?.persisted.rss.articleKeywordFilter.globalKeywords ??
        useSettingsStore.getState().persistedSettings.rss.articleKeywordFilter.globalKeywords,
    );

    updateDraft((nextDraft) => {
      updater(nextDraft);

      const nextKeywordSignature = JSON.stringify(
        nextDraft.persisted.rss.articleKeywordFilter.globalKeywords,
      );
      if (nextKeywordSignature !== currentKeywordSignature) {
        pendingKeywordReloadRef.current = true;
      }
    });
    setDraftVersion((value) => value + 1);
  };

  const currentStatusMeta = autosaveStatusMeta[autosave.status];
  const hasBlockingState = autosave.status === 'saving' || autosave.status === 'error' || hasErrors;
  const sectionErrors: Record<SettingsSectionKey, number> = {
    general: validationErrorKeys.filter((field) => field.startsWith('general.')).length,
    rss: validationErrorKeys.filter((field) => field.startsWith('rss.')).length,
    ai: validationErrorKeys.filter((field) => field.startsWith('ai.')).length,
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
      await useAppStore.getState().loadSnapshot({ view: selectedView });
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
                  <aside className="border-b border-border/70 bg-muted/35 backdrop-blur md:w-60 md:shrink-0 md:border-b-0 md:border-r supports-[backdrop-filter]:bg-muted/25">
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

                  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6">
                    <div className="w-full">
                      <TabsContent value="general" className="mt-0">
                        <GeneralSettingsPanel draft={draft} onChange={handleDraftChange} />
                      </TabsContent>
                      <TabsContent value="rss" className="mt-0">
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
                      <TabsContent value="ai" className="mt-0">
                        <AISettingsPanel draft={draft} onChange={handleDraftChange} errors={validationErrors} />
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
