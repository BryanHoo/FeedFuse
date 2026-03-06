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
import { useSettingsStore } from '../../store/settingsStore';
import GeneralSettingsPanel from './panels/GeneralSettingsPanel';
import AISettingsPanel from './panels/AISettingsPanel';
import RssSettingsPanel from './panels/RssSettingsPanel';
import { useSettingsAutosave } from './useSettingsAutosave';
import { useNotify } from '../notifications/useNotify';

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
  { key: 'general', label: '通用', hint: '主题与行为', icon: Palette },
  { key: 'rss', label: 'RSS', hint: '抓取间隔', icon: Rss },
  { key: 'ai', label: 'AI', hint: '模型与密钥', icon: Bot },
];

const autosaveStatusMeta = {
  idle: {
    label: '未修改',
    toneClass: 'text-gray-500 dark:text-gray-400',
  },
  saving: {
    label: '保存中…',
    toneClass: 'text-amber-600 dark:text-amber-300',
  },
  saved: {
    label: '已保存',
    toneClass: 'text-emerald-600 dark:text-emerald-300',
  },
  error: {
    label: '修复错误以保存',
    toneClass: 'text-red-500 dark:text-red-300',
  },
} as const;

function getSectionTabClass(selected: boolean): string {
  const base =
    'group relative min-w-[152px] justify-start rounded-2xl border px-3 py-2.5 text-left transition-colors md:min-w-0 md:w-full md:px-3 md:py-3 md:pl-7 md:before:absolute md:before:inset-y-3 md:before:left-2 md:before:w-[3px] md:before:rounded-full md:before:content-[\'\']';

  const active =
    'data-[state=active]:border-slate-200 data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-none md:data-[state=active]:before:bg-blue-500 dark:data-[state=active]:border-slate-700 dark:data-[state=active]:bg-slate-900/60 dark:data-[state=active]:text-slate-50 dark:md:data-[state=active]:before:bg-blue-400';

  if (selected) {
    return `${base} ${active}`;
  }

  return `${base} ${active} border-transparent bg-transparent text-slate-700 hover:border-slate-200/80 hover:bg-white/70 dark:text-slate-300 dark:hover:border-slate-700/70 dark:hover:bg-slate-900/35`;
}

function getSectionIconClass(selected: boolean): string {
  if (selected) {
    return 'text-blue-700 dark:text-blue-300';
  }

  return 'text-slate-500 transition-colors group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200';
}

function getSectionLabelClass(selected: boolean): string {
  if (selected) {
    return 'text-slate-950 dark:text-slate-50';
  }

  return 'text-slate-800 transition-colors group-hover:text-slate-950 dark:text-slate-100 dark:group-hover:text-slate-50';
}

function getSectionHintClass(selected: boolean): string {
  if (selected) {
    return 'text-slate-600 dark:text-slate-300';
  }

  return 'text-slate-500 transition-colors group-hover:text-slate-600 dark:text-slate-400 dark:group-hover:text-slate-300';
}

export default function SettingsCenterDrawer({ onClose }: SettingsCenterDrawerProps) {
  const [draftVersion, setDraftVersion] = useState(0);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>('general');
  const notify = useNotify();
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

    if (current === 'error' && previous !== 'error') {
      notify.error('设置自动保存失败，请检查后重试');
    }

    if (current === 'saved' && previous !== 'saved') {
      const now = Date.now();
      if (now - lastSavedNotifyAtRef.current >= 30000) {
        notify.success('设置已自动保存');
        lastSavedNotifyAtRef.current = now;
      }
    }

    lastAutosaveStatusRef.current = current;
  }, [autosave.status, notify]);

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
    updateDraft(updater);
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
          className="w-full p-0 sm:max-w-[940px]"
          data-testid="settings-center-modal"
          closeLabel="close-settings"
          overlayProps={{ 'data-testid': 'settings-center-overlay' }}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-gray-200/80 bg-white/85 px-4 py-4 backdrop-blur md:px-6 dark:border-gray-700 dark:bg-gray-900/60">
              <div className="flex items-center gap-3">
                <SheetTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  设置
                </SheetTitle>
                <span
                  role="status"
                  aria-live="polite"
                  className={`text-xs ${currentStatusMeta.toneClass}`}
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
                  <aside className="border-b border-slate-200/70 bg-gradient-to-b from-slate-50/90 to-slate-100/60 backdrop-blur md:w-60 md:shrink-0 md:border-b-0 md:border-r md:border-slate-200/70 dark:border-slate-800 dark:bg-gradient-to-b dark:from-slate-950/30 dark:to-slate-900/15">
                    <TabsList
                      aria-label="settings-sections"
                      className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent px-3 py-4 text-muted-foreground md:flex-col md:items-stretch md:gap-1.5 md:overflow-visible md:px-3 md:py-5"
                    >
                      {sectionItems.map(({ key, label, hint, icon: Icon }) => {
                        const selected = activeSection === key;
                        const errorCount = sectionErrors[key];

                        return (
                          <TabsTrigger
                            key={key}
                            value={key}
                            data-testid={`settings-section-tab-${key}`}
                            onClick={() => setActiveSection(key)}
                            className={getSectionTabClass(selected)}
                          >
                            <div className="flex w-full items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5">
                                <Icon
                                  size={16}
                                  aria-hidden="true"
                                  className={`mt-0.5 shrink-0 transition-colors ${getSectionIconClass(selected)}`}
                                />
                                <div>
                                  <p className={`text-sm font-medium ${getSectionLabelClass(selected)}`}>
                                    {label}
                                  </p>
                                  <p className={`text-xs ${getSectionHintClass(selected)}`}>
                                    {hint}
                                  </p>
                                </div>
                              </div>
                              {errorCount > 0 ? (
                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
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
                        <RssSettingsPanel draft={draft} onChange={handleDraftChange} />
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
