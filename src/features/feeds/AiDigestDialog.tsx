import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DIALOG_FORM_CONTENT_CLASS_NAME } from '@/lib/designSystem';
import type { Category, Feed } from '../../types';
import AiDigestDialogForm from './AiDigestDialogForm';
import { useAiDigestDialogForm } from './useAiDigestDialogForm';

interface AiDigestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  feeds: Feed[];
}

export default function AiDigestDialog({ open, onOpenChange, categories, feeds }: AiDigestDialogProps) {
  const fieldIdPrefix = 'add-ai-digest';
  const form = useAiDigestDialogForm({ categories, feeds, onOpenChange });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel="关闭添加AI解读源"
        className={DIALOG_FORM_CONTENT_CLASS_NAME}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          form.titleInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>添加 AI解读源</DialogTitle>
          <DialogDescription>
            选择要解读的来源与重复时间。系统会按时间窗口生成新的解读文章（有更新才会生成）。
          </DialogDescription>
        </DialogHeader>

        <AiDigestDialogForm
          fieldIdPrefix={fieldIdPrefix}
          submitting={form.submitting}
          submitError={form.submitError}
          title={form.title}
          titleInputRef={form.titleInputRef}
          titleFieldError={form.titleFieldError}
          onTitleChange={form.setTitle}
          prompt={form.prompt}
          promptFieldError={form.promptFieldError}
          onPromptChange={form.setPrompt}
          intervalMinutes={form.intervalMinutes}
          onIntervalMinutesChange={form.setIntervalMinutes}
          categoryInput={form.categoryInput}
          categoryOptions={form.categoryOptions}
          onCategoryInputChange={form.setCategoryInput}
          sourceFeedOptions={form.sourceFeedOptions}
          sourceCategoryOptions={form.sourceCategoryOptions}
          selectedFeedIds={form.selectedFeedIds}
          sourcesFieldError={form.sourcesFieldError}
          onSelectedFeedIdsChange={form.setSelectedFeedIds}
          onCancel={() => onOpenChange(false)}
          onSubmit={form.handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
