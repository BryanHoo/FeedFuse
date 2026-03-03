import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { mapApiErrorToUserMessage } from '../notifications/mapApiErrorToUserMessage';
import { useNotify } from '../notifications/useNotify';
import type { Category } from '../../types';
import { validateRssUrl } from './services/rssValidationService';

export interface FeedDialogSubmitPayload {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId: string | null;
  fullTextOnOpenEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
}

interface FeedDialogInitialValues {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId: string | null;
  fullTextOnOpenEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
  titleTranslateEnabled: boolean;
  bodyTranslateEnabled: boolean;
}

interface FeedDialogProps {
  mode: 'add' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  initialValues?: Partial<FeedDialogInitialValues>;
  onSubmit: (payload: FeedDialogSubmitPayload) => Promise<void>;
}

type ValidationState = 'idle' | 'validating' | 'verified' | 'failed';

interface ValidationStateMeta {
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  badgeText: string;
  messageTone: string;
  icon?: LucideIcon;
  iconClassName?: string;
}

interface ModeMeta {
  closeLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  sectionLabel: string;
  submitLabel: string;
  submittingLabel: string;
  successMessage: string;
  errorAction: string;
}

const VALIDATION_STATE_META: Record<ValidationState, ValidationStateMeta> = {
  idle: {
    badgeVariant: 'secondary',
    badgeText: '待验证',
    messageTone: 'text-muted-foreground',
  },
  validating: {
    badgeVariant: 'outline',
    badgeText: '验证中',
    messageTone: 'text-muted-foreground',
    icon: Loader2,
    iconClassName: 'animate-spin',
  },
  verified: {
    badgeVariant: 'default',
    badgeText: '验证成功',
    messageTone: 'text-emerald-700 dark:text-emerald-300',
    icon: CheckCircle2,
  },
  failed: {
    badgeVariant: 'destructive',
    badgeText: '验证失败',
    messageTone: 'text-destructive',
    icon: AlertCircle,
  },
};

const MODE_META: Record<FeedDialogProps['mode'], ModeMeta> = {
  add: {
    closeLabel: 'close-add-feed',
    dialogTitle: '添加 RSS 源',
    dialogDescription: '填写链接与名称，并选择分类。',
    sectionLabel: '新订阅源',
    submitLabel: '添加',
    submittingLabel: '添加中...',
    successMessage: '已添加订阅源',
    errorAction: 'create-feed',
  },
  edit: {
    closeLabel: 'close-edit-feed',
    dialogTitle: '编辑 RSS 源',
    dialogDescription: '填写链接与名称，并选择分类。',
    sectionLabel: '订阅源配置',
    submitLabel: '保存',
    submittingLabel: '保存中...',
    successMessage: '保存成功',
    errorAction: 'update-feed',
  },
};

function resolveInitialCategoryValue(
  categoryId: string | null | undefined,
  categories: Category[],
  uncategorizedValue: string,
) {
  if (!categoryId) return uncategorizedValue;
  const exists = categories.some((item) => item.id === categoryId && item.name !== '未分类');
  return exists ? categoryId : uncategorizedValue;
}

export default function FeedDialog({
  mode,
  open,
  onOpenChange,
  categories,
  initialValues,
  onSubmit,
}: FeedDialogProps) {
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const uncategorizedValue = '__uncategorized__';
  const selectableCategories = categories.filter((item) => item.name !== '未分类');
  const initialCategoryId =
    typeof initialValues?.categoryId === 'undefined'
      ? selectableCategories[0]?.id
      : initialValues.categoryId;
  const defaultCategoryValue = resolveInitialCategoryValue(
    initialCategoryId,
    categories,
    uncategorizedValue,
  );
  const initialUrl = initialValues?.url ?? '';
  const initialTrimmedUrl = initialUrl.trim();
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [url, setUrl] = useState(initialUrl);
  const [categoryId, setCategoryId] = useState(defaultCategoryValue);
  const [fullTextOnOpenEnabledValue, setFullTextOnOpenEnabledValue] = useState<'enabled' | 'disabled'>(
    initialValues?.fullTextOnOpenEnabled ? 'enabled' : 'disabled',
  );
  const [aiSummaryOnOpenEnabledValue, setAiSummaryOnOpenEnabledValue] = useState<'enabled' | 'disabled'>(
    initialValues?.aiSummaryOnOpenEnabled ? 'enabled' : 'disabled',
  );
  const [titleTranslateEnabledValue, setTitleTranslateEnabledValue] = useState<'enabled' | 'disabled'>(
    initialValues?.titleTranslateEnabled ? 'enabled' : 'disabled',
  );
  const [bodyTranslateEnabledValue, setBodyTranslateEnabledValue] = useState<'enabled' | 'disabled'>(
    initialValues?.bodyTranslateEnabled ? 'enabled' : 'disabled',
  );
  const [validationState, setValidationState] = useState<ValidationState>(
    initialTrimmedUrl ? 'verified' : 'idle',
  );
  const [lastVerifiedUrl, setLastVerifiedUrl] = useState<string | null>(initialTrimmedUrl || null);
  const [validatedSiteUrl, setValidatedSiteUrl] = useState<string | null>(initialValues?.siteUrl ?? null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const validationRequestIdRef = useRef(0);
  const modeMeta = MODE_META[mode];
  const notify = useNotify();

  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();
  const canSave =
    Boolean(trimmedTitle) &&
    Boolean(trimmedUrl) &&
    validationState === 'verified' &&
    lastVerifiedUrl === trimmedUrl &&
    !submitting;
  const validationMeta = VALIDATION_STATE_META[validationState];
  const ValidationIcon = validationMeta.icon;
  const fieldIdPrefix = mode === 'add' ? 'add-feed' : 'edit-feed';

  const resetValidationState = () => {
    setValidationState('idle');
    setLastVerifiedUrl(null);
    setValidatedSiteUrl(null);
    setValidationMessage(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;

    void (async () => {
      setSubmitting(true);
      try {
        await onSubmit({
          title: trimmedTitle,
          url: trimmedUrl,
          siteUrl: validatedSiteUrl,
          categoryId: categoryId === uncategorizedValue ? null : categoryId,
          fullTextOnOpenEnabled: fullTextOnOpenEnabledValue === 'enabled',
          aiSummaryOnOpenEnabled: aiSummaryOnOpenEnabledValue === 'enabled',
          titleTranslateEnabled: titleTranslateEnabledValue === 'enabled',
          bodyTranslateEnabled: bodyTranslateEnabledValue === 'enabled',
        });
        notify.success(modeMeta.successMessage);
        onOpenChange(false);
      } catch (err) {
        notify.error(mapApiErrorToUserMessage(err, modeMeta.errorAction));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const handleValidate = async (urlToValidate: string) => {
    if (!urlToValidate) {
      resetValidationState();
      return;
    }

    const requestId = validationRequestIdRef.current + 1;
    validationRequestIdRef.current = requestId;
    setValidationState('validating');
    setValidationMessage('正在验证链接...');

    const result = await validateRssUrl(urlToValidate);
    if (requestId !== validationRequestIdRef.current) {
      return;
    }

    if (result.ok) {
      setValidationState('verified');
      setLastVerifiedUrl(urlToValidate);
      setValidatedSiteUrl(typeof result.siteUrl === 'string' ? result.siteUrl : null);
      setValidationMessage('链接验证成功。');

      const suggestedTitle = typeof result.title === 'string' ? result.title.trim() : '';
      if (suggestedTitle) {
        setTitle(suggestedTitle);
      }
      return;
    }

    setValidationState('failed');
    setLastVerifiedUrl(null);
    setValidatedSiteUrl(null);
    setValidationMessage(result.message ?? '链接验证失败。');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={modeMeta.closeLabel}
        className="max-w-[34rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          urlInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{modeMeta.dialogTitle}</DialogTitle>
          <DialogDescription>{modeMeta.dialogDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4 border-b border-border pb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-primary">{modeMeta.sectionLabel}</p>
              </div>
              <Badge variant={validationMeta.badgeVariant} className="h-7 rounded-full px-2.5 text-xs font-medium">
                {validationMeta.badgeText}
              </Badge>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-url`} className="text-xs">
                  URL
                </Label>
                <Input
                  ref={urlInputRef}
                  id={`${fieldIdPrefix}-url`}
                  type="url"
                  value={url}
                  onChange={(event) => {
                    validationRequestIdRef.current += 1;
                    setUrl(event.target.value);
                    resetValidationState();
                  }}
                  onBlur={(event) => {
                    const blurValue = event.currentTarget.value.trim();
                    if (validationState === 'verified' && lastVerifiedUrl === blurValue) {
                      return;
                    }
                    void handleValidate(blurValue);
                  }}
                  placeholder="https://example.com/feed.xml"
                />
                <p role="status" aria-live="polite" className={`mt-1 text-xs ${validationMeta.messageTone}`}>
                  {validationMessage ? (
                    <span className="inline-flex items-center gap-1">
                      {ValidationIcon ? <ValidationIcon size={13} className={validationMeta.iconClassName} /> : null}
                      {validationMessage}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-title`} className="text-xs">
                  名称
                </Label>
                <Input
                  id={`${fieldIdPrefix}-title`}
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：The Verge"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-category`} className="text-xs">
                  分类
                </Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id={`${fieldIdPrefix}-category`} aria-label="分类">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableCategories.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={uncategorizedValue}>未分类</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-fulltext-on-open`} className="text-xs">
                  打开文章时抓取全文
                </Label>
                <Select
                  value={fullTextOnOpenEnabledValue}
                  onValueChange={(value) => {
                    if (value === 'enabled' || value === 'disabled') {
                      setFullTextOnOpenEnabledValue(value);
                    }
                  }}
                >
                  <SelectTrigger id={`${fieldIdPrefix}-fulltext-on-open`} aria-label="打开文章时抓取全文">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">关闭</SelectItem>
                    <SelectItem value="enabled">开启</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">开启后会访问原文链接并尝试抽取正文</p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-ai-summary-on-open`} className="text-xs">
                  打开文章时自动生成 AI 摘要
                </Label>
                <Select
                  value={aiSummaryOnOpenEnabledValue}
                  onValueChange={(value) => {
                    if (value === 'enabled' || value === 'disabled') {
                      setAiSummaryOnOpenEnabledValue(value);
                    }
                  }}
                >
                  <SelectTrigger id={`${fieldIdPrefix}-ai-summary-on-open`} aria-label="打开文章时自动生成 AI 摘要">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">关闭</SelectItem>
                    <SelectItem value="enabled">开启</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">开启后将自动为文章生成中文摘要</p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-title-translate-enabled`} className="text-xs">
                  列表标题自动翻译
                </Label>
                <Select
                  value={titleTranslateEnabledValue}
                  onValueChange={(value) => {
                    if (value === 'enabled' || value === 'disabled') {
                      setTitleTranslateEnabledValue(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${fieldIdPrefix}-title-translate-enabled`}
                    aria-label="列表标题自动翻译"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">关闭</SelectItem>
                    <SelectItem value="enabled">开启</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">开启后会自动翻译新文章标题</p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-body-translate-enabled`} className="text-xs">
                  正文翻译
                </Label>
                <Select
                  value={bodyTranslateEnabledValue}
                  onValueChange={(value) => {
                    if (value === 'enabled' || value === 'disabled') {
                      setBodyTranslateEnabledValue(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${fieldIdPrefix}-body-translate-enabled`}
                    aria-label="正文翻译"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disabled">关闭</SelectItem>
                    <SelectItem value="enabled">开启</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">开启后允许生成正文双语翻译</p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" disabled={!canSave}>
              {submitting ? modeMeta.submittingLabel : modeMeta.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
