import { AlertCircle, CheckCircle2, Loader2, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DIALOG_FORM_CONTENT_CLASS_NAME } from '@/lib/designSystem';
import type { UserOperationActionKey } from '@/lib/userOperationCatalog';
import type { Category } from '../../types';
import FeedDialogForm from './FeedDialogForm';
import type {
  FeedDialogInitialValues,
  FeedDialogMode,
  FeedDialogSubmitPayload,
  ValidationState,
} from './feedDialog.types';
import { useFeedDialogForm } from './useFeedDialogForm';

export type { FeedDialogSubmitPayload } from './feedDialog.types';

interface FeedDialogProps {
  mode: FeedDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  initialValues?: Partial<FeedDialogInitialValues>;
  onSubmit: (payload: FeedDialogSubmitPayload) => Promise<void>;
}

interface ValidationStateMeta {
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  badgeText: string;
  messageTone: string;
  icon?: LucideIcon;
  iconClassName?: string;
}

interface ModeMeta {
  actionKey: UserOperationActionKey;
  closeLabel: string;
  dialogTitle: string;
  dialogDescription: string;
  sectionLabel: string;
  submitLabel: string;
  submittingLabel: string;
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

const MODE_META: Record<FeedDialogMode, ModeMeta> = {
  add: {
    actionKey: 'feed.create',
    closeLabel: '关闭添加 RSS 源',
    dialogTitle: '添加 RSS 源',
    dialogDescription: '输入 RSS 地址后，我们会自动验证链接，并尽量补全订阅名称。',
    sectionLabel: '订阅信息',
    submitLabel: '添加订阅源',
    submittingLabel: '正在添加订阅源…',
  },
  edit: {
    actionKey: 'feed.update',
    closeLabel: '关闭编辑 RSS 源',
    dialogTitle: '编辑 RSS 源',
    dialogDescription: '修改订阅地址、名称或分类。保存后不会影响已有文章。',
    sectionLabel: '订阅信息',
    submitLabel: '保存订阅源',
    submittingLabel: '正在保存订阅源…',
  },
};


export default function FeedDialog({
  mode,
  open,
  onOpenChange,
  categories,
  initialValues,
  onSubmit,
}: FeedDialogProps) {
  const modeMeta = MODE_META[mode];
  const form = useFeedDialogForm({
    actionKey: modeMeta.actionKey,
    categories,
    initialValues,
    onSubmit,
    onOpenChange,
  });
  const validationMeta = VALIDATION_STATE_META[form.validationState];
  const ValidationIcon = validationMeta.icon;
  const fieldIdPrefix = mode === 'add' ? 'add-feed' : 'edit-feed';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={modeMeta.closeLabel}
        className={DIALOG_FORM_CONTENT_CLASS_NAME}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          form.urlInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{modeMeta.dialogTitle}</DialogTitle>
          <DialogDescription>{modeMeta.dialogDescription}</DialogDescription>
        </DialogHeader>
        <FeedDialogForm
          badgeText={validationMeta.badgeText}
          badgeVariant={validationMeta.badgeVariant}
          canSave={form.canSave}
          categoryInput={form.categoryInput}
          categoryOptions={form.categoryOptions}
          fieldIdPrefix={fieldIdPrefix}
          messageTone={validationMeta.messageTone}
          onCancel={() => onOpenChange(false)}
          onCategoryChange={form.setCategoryInput}
          onSubmit={form.handleSubmit}
          onTitleBlur={form.handleTitleBlur}
          onTitleChange={form.handleTitleChange}
          onUrlBlur={form.handleUrlBlur}
          onUrlChange={form.handleUrlChange}
          sectionLabel={modeMeta.sectionLabel}
          submitError={form.submitError}
          submitLabel={modeMeta.submitLabel}
          submitting={form.submitting}
          submittingLabel={modeMeta.submittingLabel}
          title={form.title}
          titleFieldError={form.titleFieldError}
          titleInputRef={form.titleInputRef}
          url={form.url}
          urlFieldError={form.urlFieldError}
          urlInputRef={form.urlInputRef}
          validationIcon={ValidationIcon}
          validationIconClassName={validationMeta.iconClassName}
          validationMessage={form.validationMessage}
        />
      </DialogContent>
    </Dialog>
  );
}
