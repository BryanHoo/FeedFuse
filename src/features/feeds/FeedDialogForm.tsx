import type { FormEvent, RefObject } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Category } from '../../types';
import CreatableCategoryField from './CreatableCategoryField';

interface FeedDialogFormProps {
  badgeText: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
  canSave: boolean;
  categoryInput: string;
  categoryOptions: Category[];
  fieldIdPrefix: string;
  messageTone: string;
  onCancel: () => void;
  onCategoryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTitleBlur: () => void;
  onTitleChange: (value: string) => void;
  onUrlBlur: (value: string) => void;
  onUrlChange: (value: string) => void;
  sectionLabel: string;
  submitError: string | null;
  submitLabel: string;
  submitting: boolean;
  submittingLabel: string;
  title: string;
  titleFieldError: string | null | undefined;
  titleInputRef: RefObject<HTMLInputElement | null>;
  url: string;
  urlFieldError: string | null | undefined;
  urlInputRef: RefObject<HTMLInputElement | null>;
  validationIcon?: LucideIcon;
  validationIconClassName?: string;
  validationMessage: string | null;
}

export default function FeedDialogForm({
  badgeText,
  badgeVariant,
  canSave,
  categoryInput,
  categoryOptions,
  fieldIdPrefix,
  messageTone,
  onCancel,
  onCategoryChange,
  onSubmit,
  onTitleBlur,
  onTitleChange,
  onUrlBlur,
  onUrlChange,
  sectionLabel,
  submitError,
  submitLabel,
  submitting,
  submittingLabel,
  title,
  titleFieldError,
  titleInputRef,
  url,
  urlFieldError,
  urlInputRef,
  validationIcon: ValidationIcon,
  validationIconClassName,
  validationMessage,
}: FeedDialogFormProps) {
  const urlInputId = `${fieldIdPrefix}-url`;
  const titleInputId = `${fieldIdPrefix}-title`;
  const categoryInputId = `${fieldIdPrefix}-category`;
  const urlMessageId = `${fieldIdPrefix}-url-message`;
  const titleMessageId = `${fieldIdPrefix}-title-message`;
  const submitErrorId = `${fieldIdPrefix}-submit-error`;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-busy={submitting} noValidate>
      <div className="space-y-4 border-b border-border pb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-primary">{sectionLabel}</p>
          </div>
          <Badge variant={badgeVariant} className="h-7 rounded-full px-2.5 text-xs font-medium">
            {badgeText}
          </Badge>
        </div>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={urlInputId} className="text-xs">
              URL
            </Label>
            <Input
              ref={urlInputRef}
              id={urlInputId}
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              onBlur={(event) => onUrlBlur(event.currentTarget.value)}
              placeholder="https://example.com/feed.xml"
              aria-invalid={urlFieldError ? 'true' : 'false'}
              aria-describedby={urlMessageId}
              aria-errormessage={urlFieldError ? urlMessageId : undefined}
            />
            <p
              id={urlMessageId}
              role={urlFieldError ? 'alert' : 'status'}
              aria-live={urlFieldError ? 'assertive' : 'polite'}
              className={`mt-1 break-all text-xs ${urlFieldError ? 'text-destructive' : messageTone}`}
            >
              {urlFieldError || validationMessage ? (
                <span className="inline-flex items-center gap-1">
                  {!urlFieldError && ValidationIcon ? (
                    <ValidationIcon size={13} className={validationIconClassName} />
                  ) : null}
                  {urlFieldError ?? validationMessage}
                </span>
              ) : null}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={titleInputId} className="text-xs">
              名称
            </Label>
            <Input
              ref={titleInputRef}
              id={titleInputId}
              name="title"
              type="text"
              autoComplete="off"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              onBlur={onTitleBlur}
              placeholder="例如：The Verge"
              aria-invalid={titleFieldError ? 'true' : 'false'}
              aria-describedby={titleFieldError ? titleMessageId : undefined}
              aria-errormessage={titleFieldError ? titleMessageId : undefined}
            />
            {titleFieldError ? (
              <p id={titleMessageId} role="alert" className="text-xs text-destructive">
                {titleFieldError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={categoryInputId} className="text-xs">
              分类
            </Label>
            <CreatableCategoryField
              inputId={categoryInputId}
              value={categoryInput}
              options={categoryOptions}
              onChange={onCategoryChange}
            />
          </div>
        </div>
      </div>

      {submitError ? (
        <p id={submitErrorId} role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}

      <DialogFooter className="pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button type="submit" disabled={!canSave} aria-describedby={submitError ? submitErrorId : undefined}>
          {submitting ? submittingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
