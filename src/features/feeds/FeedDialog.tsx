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
import type { Category } from '../../types';
import { useNotify } from '../notifications/useNotify';
import { validateRssUrl } from './services/rssValidationService';
import CreatableCategoryField from './CreatableCategoryField';

export interface FeedDialogSubmitPayload {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
}

interface FeedDialogInitialValues {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId: string | null;
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
    messageTone: 'text-success',
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
    dialogDescription: '输入 RSS 地址后，我们会自动验证链接，并尽量补全订阅名称。',
    sectionLabel: '订阅信息',
    submitLabel: '添加',
    submittingLabel: '添加中…',
    successMessage: '已添加订阅源',
  },
  edit: {
    closeLabel: 'close-edit-feed',
    dialogTitle: '编辑 RSS 源',
    dialogDescription: '修改订阅地址、名称或分类。保存后不会影响已有文章。',
    sectionLabel: '订阅信息',
    submitLabel: '保存',
    submittingLabel: '保存中…',
    successMessage: '订阅源已更新',
  },
};

const uncategorizedCategory: Category = {
  id: 'cat-uncategorized',
  name: '未分类',
  expanded: true,
};

function normalizeCategoryText(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

function normalizeCategoryKey(value: string | null | undefined): string {
  return normalizeCategoryText(value).toLowerCase();
}

function ensureCategoryOptions(categories: Category[]): Category[] {
  if (categories.some((item) => item.name === uncategorizedCategory.name)) {
    return categories;
  }

  return [uncategorizedCategory, ...categories];
}

function resolveInitialCategoryInput(
  categoryId: string | null | undefined,
  categories: Category[],
  fallbackCategoryId: string | null,
) {
  const nextCategoryId = typeof categoryId === 'undefined' ? fallbackCategoryId : categoryId;
  if (!nextCategoryId) return uncategorizedCategory.name;

  return categories.find((item) => item.id === nextCategoryId)?.name ?? uncategorizedCategory.name;
}

function findMatchingCategory(categories: Category[], input: string): Category | undefined {
  const normalizedInput = normalizeCategoryText(input);
  if (!normalizedInput) return undefined;

  const normalizedKey = normalizedInput.toLowerCase();
  return categories.find(
    (item) => item.id === normalizedInput || normalizeCategoryKey(item.name) === normalizedKey,
  );
}

function isUncategorizedInput(value: string): boolean {
  return (
    !normalizeCategoryText(value) ||
    normalizeCategoryKey(value) === normalizeCategoryKey(uncategorizedCategory.name)
  );
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
  const categoryOptions = ensureCategoryOptions(categories);
  const selectableCategories = categoryOptions.filter(
    (item) => item.name !== uncategorizedCategory.name,
  );
  const initialCategoryId =
    typeof initialValues?.categoryId === 'undefined'
      ? selectableCategories[0]?.id
      : initialValues.categoryId;
  const defaultCategoryInput = resolveInitialCategoryInput(
    initialCategoryId,
    categoryOptions,
    selectableCategories[0]?.id ?? null,
  );
  const initialUrl = initialValues?.url ?? '';
  const initialTrimmedUrl = initialUrl.trim();
  const [title, setTitle] = useState(initialValues?.title ?? '');
  const [url, setUrl] = useState(initialUrl);
  const [categoryInput, setCategoryInput] = useState(defaultCategoryInput);
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
        const matchedCategory = findMatchingCategory(categoryOptions, categoryInput);
        const categoryPayload = isUncategorizedInput(categoryInput)
          ? { categoryId: null }
          : matchedCategory && matchedCategory.name !== uncategorizedCategory.name
            ? { categoryId: matchedCategory.id }
            : { categoryName: normalizeCategoryText(categoryInput) };

        await onSubmit({
          title: trimmedTitle,
          url: trimmedUrl,
          siteUrl: validatedSiteUrl,
          ...categoryPayload,
        });
        notify.success(modeMeta.successMessage);
        onOpenChange(false);
      } catch {
        // apiClient handles failure notifications globally
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
    setValidationMessage('正在验证链接…');

    try {
      const result = await validateRssUrl(urlToValidate);
      if (requestId !== validationRequestIdRef.current) {
        return;
      }

      if (result.ok) {
        setValidationState('verified');
        setLastVerifiedUrl(urlToValidate);
        setValidatedSiteUrl(typeof result.siteUrl === 'string' ? result.siteUrl : null);
        setValidationMessage('链接可用，已识别为 RSS 源。');

        const suggestedTitle = typeof result.title === 'string' ? result.title.trim() : '';
        if (suggestedTitle) {
          setTitle(suggestedTitle);
        }
        return;
      }

      setValidationState('failed');
      setLastVerifiedUrl(null);
      setValidatedSiteUrl(null);
      setValidationMessage(result.message ?? '暂时无法验证该链接，请检查后重试。');
    } catch {
      if (requestId !== validationRequestIdRef.current) {
        return;
      }

      setValidationState('failed');
      setLastVerifiedUrl(null);
      setValidatedSiteUrl(null);
      setValidationMessage('暂时无法验证该链接，请检查后重试。');
    }
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
                  name="url"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
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
                <p
                  role="status"
                  aria-live="polite"
                  className={`mt-1 break-all text-xs ${validationMeta.messageTone}`}
                >
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
                  name="title"
                  type="text"
                  autoComplete="off"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="例如：The Verge"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor={`${fieldIdPrefix}-category`} className="text-xs">
                  分类
                </Label>
                <CreatableCategoryField
                  inputId={`${fieldIdPrefix}-category`}
                  value={categoryInput}
                  options={categoryOptions}
                  onChange={setCategoryInput}
                />
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
