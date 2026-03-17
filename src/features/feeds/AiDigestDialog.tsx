import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DIALOG_FORM_CONTENT_CLASS_NAME } from "@/lib/designSystem";
import type { Category, Feed } from "../../types";
import AiDigestDialogForm from "./AiDigestDialogForm";
import { useAiDigestDialogForm } from "./useAiDigestDialogForm";

type AiDigestDialogMode = "add" | "edit";

interface AiDigestDialogProps {
  mode: AiDigestDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  feeds: Feed[];
  feedId?: string;
  initialTitle?: string;
  initialCategoryId?: string | null;
}

export default function AiDigestDialog({
  mode,
  open,
  onOpenChange,
  categories,
  feeds,
  feedId,
  initialTitle,
  initialCategoryId,
}: AiDigestDialogProps) {
  const isEditMode = mode === "edit";
  const fieldIdPrefix = isEditMode ? "edit-ai-digest" : "add-ai-digest";
  const form = useAiDigestDialogForm({
    mode,
    categories,
    feeds,
    onOpenChange,
    feedId,
    initialTitle,
    initialCategoryId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={isEditMode ? "关闭编辑AI解读源" : "关闭添加AI解读源"}
        className={DIALOG_FORM_CONTENT_CLASS_NAME}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          form.titleInputRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{isEditMode ? "编辑 AI 解读源" : "添加 AI 解读源"}</DialogTitle>
          <DialogDescription>
            选择要解读的来源与重复时间。系统会按时间窗口生成新的解读文章。
          </DialogDescription>
        </DialogHeader>

        <AiDigestDialogForm
          fieldIdPrefix={fieldIdPrefix}
          loadingInitialValues={form.loadingInitialValues}
          submitting={form.submitting}
          submitError={form.submitError}
          submitButtonLabel={isEditMode ? "保存 AI 解读源" : "创建 AI解读源"}
          submittingButtonLabel={isEditMode ? "保存中…" : "创建中…"}
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
