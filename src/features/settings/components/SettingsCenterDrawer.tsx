import { Bot, Flame, KeyRound, Palette, Rss, ScrollText, type LucideIcon } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
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
} from '@/lib/ui/designSystem';
import { exportOpml, importOpml } from '@/lib/api/apiClient';
import { cn } from '@/lib/utils';
import { useAppStore } from '../../../store/appStore';
import { useSettingsStore } from '../../../store/settingsStore';
import GeneralSettingsPanel from '../panels/GeneralSettingsPanel';
import AISettingsPanel from '../panels/AISettingsPanel';
import LogsSettingsPanel from '../panels/LogsSettingsPanel';
import RssSettingsPanel from '../panels/RssSettingsPanel';
import SecuritySettingsPanel from '../panels/SecuritySettingsPanel';
import FeverAccountSettingsPanel from '../panels/FeverAccountSettingsPanel';
import type { OpmlTransferResultSummary } from '../panels/OpmlTransferSection';
import { useSettingsAutosave } from '../hooks';
import {
  runImmediateFailure,
  runImmediateOperation,
  runImmediateSuccess,
} from '../../notifications/userOperationNotifier';

interface SettingsCenterDrawerProps {
  onClose: () => void;
}

type SettingsSectionKey = 'general' | 'rss' | 'ai' | 'security' | 'fever' | 'logging';

interface SettingsSectionItem {
  key: SettingsSectionKey;
  label: string;
  icon: LucideIcon;
}

const sectionItems: SettingsSectionItem[] = [
  { key: 'general', label: '通用', icon: Palette },
  { key: 'rss', label: 'RSS', icon: Rss },
  { key: 'ai', label: 'AI', icon: Bot },
  { key: 'security', label: '账号与安全', icon: KeyRound },
  { key: 'fever', label: 'Fever 账号', icon: Flame },
  { key: 'logging', label: '日志', icon: ScrollText },
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
    label: '保存失败',
    toneClass: 'text-error',
  },
  invalid: {
    label: '请修正字段错误',
    toneClass: 'text-error',
  },
} as const;

function describeErrorField(field: string): string {
  const labels: Record<string, string> = {
    'ai.model': 'AI 模型',
    'ai.apiBaseUrl': 'API 地址',
    'ai.apiKey': 'API 密钥',
    'ai.translation.model': '翻译模型',
    'ai.translation.apiBaseUrl': '翻译 API 地址',
    'ai.translation.apiKey': '翻译 API 密钥',
  };
  if (labels[field]) return labels[field];
  const rssField = field.match(/^rss\.sources\.(\d+)\.(name|url)$/);
  if (rssField) return `第 ${Number(rssField[1]) + 1} 个订阅源${rssField[2] === 'name' ? '名称' : '地址'}`;
  const section = sectionItems.find((item) => field.startsWith(`${item.key}.`));
  return section ? `${section.label}设置（${field}）` : `设置字段（${field}）`;
}

const settingsSectionTabClassName =
  'group relative min-w-[152px] justify-start rounded-xl border border-transparent bg-transparent px-3 py-2.5 text-left text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-border/70 hover:bg-background/55 hover:text-foreground dark:hover:border-white/[0.05] dark:hover:bg-[color-mix(in_oklab,var(--color-primary)_8%,var(--color-card)_92%)] data-[state=active]:border-border data-[state=active]:bg-[color-mix(in_oklab,var(--color-background)_84%,white_16%)] data-[state=active]:text-foreground dark:data-[state=active]:border-[rgba(94,106,210,0.14)] dark:data-[state=active]:bg-[color-mix(in_oklab,var(--color-primary)_10%,var(--color-card)_90%)] md:min-w-0 md:w-full md:px-3 md:py-3 md:pl-7 md:before:absolute md:before:inset-y-3 md:before:left-2 md:before:w-[3px] md:before:rounded-full md:before:content-[\'\'] md:data-[state=active]:before:bg-[linear-gradient(180deg,var(--color-primary),color-mix(in_oklab,var(--color-primary)_74%,white_26%))]';

const settingsSectionIconClassName =
  'mt-0.5 shrink-0 text-muted-foreground transition-colors duration-200 group-data-[state=active]:text-primary group-hover:text-foreground';

const settingsSectionLabelClassName =
  'text-sm font-medium text-foreground/90 transition-colors group-data-[state=active]:text-foreground group-hover:text-foreground';

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
  const rssSnapshotReloadPendingRef = useRef(false);
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

  const reloadCurrentSnapshot = () =>
    useAppStore.getState().loadSnapshot({ view: useAppStore.getState().selectedView });

  useEffect(() => {
    const previous = lastAutosaveStatusRef.current;
    const current = autosave.status;

    if (current === 'saved' && previous !== 'saved') {
      const now = Date.now();
      if (now - lastSavedNotifyAtRef.current >= 30000) {
        runImmediateSuccess({ actionKey: 'settings.save' });
        lastSavedNotifyAtRef.current = now;
      }

      if (rssSnapshotReloadPendingRef.current) {
        rssSnapshotReloadPendingRef.current = false;
        void reloadCurrentSnapshot();
      }
    }

    if (current === 'error' && previous !== 'error') {
      const result = autosave.saveResult;
      if (result?.shouldNotify) {
        runImmediateFailure({
          actionKey: 'settings.save',
          err: result.err,
        });
      }
    }

    lastAutosaveStatusRef.current = current;
  }, [autosave.status, autosave.saveResult]);

  useEffect(() => {
    void (async () => {
      await hydratePersistedSettings();
      startTransition(() => {
        loadDraft();
      });
    })();
  }, [hydratePersistedSettings, loadDraft]);


  const forceClose = () => {
    discardDraft();
    onClose();
  };

  const handleDraftChange = (
    section: SettingsSectionKey,
    updater: Parameters<typeof updateDraft>[0],
  ) => {
    updateDraft((nextDraft) => {
      updater(nextDraft);
    });
    if (section === 'rss') {
      // RSS 过滤与文章留存影响当前列表，仅在确认保存成功后重新加载快照。
      rssSnapshotReloadPendingRef.current = true;
    }
    setDraftVersion((value) => value + 1);
  };

  const currentStatusMeta = autosaveStatusMeta[autosave.status];
  const hasBlockingState = autosave.status === 'saving' || autosave.status === 'error' || hasErrors;
  const sectionErrors: Record<SettingsSectionKey, number> = {
    general: validationErrorKeys.filter((field) => field.startsWith('general.')).length,
    rss: validationErrorKeys.filter((field) => field.startsWith('rss.')).length,
    ai: validationErrorKeys.filter((field) => field.startsWith('ai.')).length,
    security: 0,
    fever: 0,
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
      const result = await runImmediateOperation({
        actionKey: 'opml.import',
        execute: () =>
          importOpml({ content, fileName: file.name }, { notifyOnError: false }),
      });
      setLastOpmlImportResult(result);
      await reloadCurrentSnapshot().catch((err) => {
        console.error(err);
      });
    } catch (err) {
      console.error(err);
    } finally {
      setOpmlImporting(false);
    }
  };

  const handleOpmlExport = async () => {
    setOpmlExporting(true);

    let objectUrl: string | null = null;
    try {
      await runImmediateOperation({
        actionKey: 'opml.export',
        execute: async () => {
          const result = await exportOpml({ notifyOnError: false });
          const blob = new Blob([result.xml], { type: 'application/xml;charset=utf-8' });
          objectUrl = URL.createObjectURL(blob);

          const anchor = document.createElement('a');
          anchor.href = objectUrl;
          anchor.download = result.fileName;
          anchor.click();

          return result;
        },
      });
    } catch (err) {
      console.error(err);
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

            {/* 错误文本与恢复操作持续显示，网络故障不要求用户修改正确的字段。 */}
            {autosave.status === 'error' || autosave.status === 'invalid' ? (
              <div className="border-b border-border/70 px-4 py-3 md:px-6">
                <div role="alert" className="space-y-1 text-sm text-error">
                  <p>{hasErrors
                    ? '请修正以下字段，修改后会自动保存。'
                    : autosave.saveResult?.failure?.message ?? '保存失败，请稍后点击“重试保存”。'}</p>
                  <p className="text-xs text-muted-foreground">
                    {autosave.saveResult?.failure?.outcome === 'unchanged' || hasErrors
                      ? '本次修改尚未保存；此前成功保存的内容不受影响。'
                      : '本次设置和密钥的保存结果尚未确认；重试会重新提交完整草稿。'}
                    {' '}草稿已保留，请保持设置窗口打开。
                  </p>
                  {hasErrors ? (
                    <ul className="list-inside list-disc">
                      {Object.entries(validationErrors).map(([field, message]) => (
                        <li key={field}>{describeErrorField(field)}：{message}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {!hasErrors ? (
                  <Button type="button" size="sm" variant="outline" className="mt-2" onClick={autosave.retry}>
                    重试保存
                  </Button>
                ) : null}
              </div>
            ) : autosave.status === 'saved' ? (
              <p className="px-4 pt-3 text-xs text-muted-foreground md:px-6">本次设置和密钥修改均已保存。</p>
            ) : null}

            {draft ? (
              <Tabs
                value={activeSection}
                onValueChange={(value) => setActiveSection(value as SettingsSectionKey)}
                className="min-h-0 flex-1"
              >
                <div className="flex h-full min-h-0 flex-col md:flex-row">
                  <aside className="border-b border-border/70 bg-muted/40 backdrop-blur md:w-60 md:shrink-0 md:border-b-0 md:border-r md:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-muted)_82%,white_18%),transparent)] supports-[backdrop-filter]:bg-muted/30">
                    <TabsList
                      aria-label="设置导航"
                      className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent px-3 py-4 text-muted-foreground md:flex-col md:items-stretch md:gap-1.5 md:overflow-visible md:px-3 md:py-5"
                    >
                      {sectionItems.map(({ key, label, icon: Icon }) => {
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
                        <GeneralSettingsPanel
                          draft={draft}
                          onChange={(updater) => handleDraftChange('general', updater)}
                        />
                      </TabsContent>
                      <TabsContent value="rss" className="mt-0 h-full overflow-y-auto">
                        <RssSettingsPanel
                          draft={draft}
                          onChange={(updater) => handleDraftChange('rss', updater)}
                          opmlImporting={opmlImporting}
                          opmlExporting={opmlExporting}
                          lastOpmlImportResult={lastOpmlImportResult}
                          onOpmlImport={handleOpmlImport}
                          onOpmlExport={handleOpmlExport}
                        />
                      </TabsContent>
                      <TabsContent value="ai" className="mt-0 h-full overflow-y-auto">
                        <AISettingsPanel
                          draft={draft}
                          onChange={(updater) => handleDraftChange('ai', updater)}
                          errors={validationErrors}
                        />
                      </TabsContent>
                      <TabsContent value="security" className="mt-0 h-full overflow-y-auto">
                        <SecuritySettingsPanel />
                      </TabsContent>
                      <TabsContent value="fever" className="mt-0 h-full overflow-y-auto">
                        <FeverAccountSettingsPanel />
                      </TabsContent>
                      <TabsContent value="logging" className="mt-0 h-full min-h-0">
                        <LogsSettingsPanel
                          draft={draft}
                          onChange={(updater) => handleDraftChange('logging', updater)}
                        />
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
            {hasErrors ? '请继续编辑并修正字段错误，或确认放弃未保存的草稿。'
              : '请继续编辑并重试保存，或确认放弃未确认保存的草稿。'}
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
