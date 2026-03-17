import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Category, Feed } from "../../types";
import AiDigestSourceTreeSelect from "./AiDigestSourceTreeSelect";
import CreatableCategoryField from "./CreatableCategoryField";
import { AI_DIGEST_INTERVAL_OPTIONS_MINUTES } from "./useAiDigestDialogForm";

interface AiDigestDialogFormProps {
  fieldIdPrefix: string;
  submitting: boolean;
  submitError: string | null;
  title: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  titleFieldError: string | null;
  onTitleChange: (value: string) => void;
  prompt: string;
  promptFieldError: string | null;
  onPromptChange: (value: string) => void;
  intervalMinutes: number;
  onIntervalMinutesChange: (value: number) => void;
  categoryInput: string;
  categoryOptions: Category[];
  onCategoryInputChange: (value: string) => void;
  sourceFeedOptions: Feed[];
  sourceCategoryOptions: Category[];
  selectedFeedIds: string[];
  sourcesFieldError: string | null;
  onSelectedFeedIdsChange: (feedIds: string[]) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

function formatIntervalOption(minutes: number): string {
  if (minutes === 1440) return "每天";
  const hours = Math.round(minutes / 60);
  return `每 ${hours} 小时`;
}

export default function AiDigestDialogForm({
  fieldIdPrefix,
  submitting,
  submitError,
  title,
  titleInputRef,
  titleFieldError,
  onTitleChange,
  prompt,
  promptFieldError,
  onPromptChange,
  intervalMinutes,
  onIntervalMinutesChange,
  categoryInput,
  categoryOptions,
  onCategoryInputChange,
  sourceFeedOptions,
  sourceCategoryOptions,
  selectedFeedIds,
  sourcesFieldError,
  onSelectedFeedIdsChange,
  onCancel,
  onSubmit,
}: AiDigestDialogFormProps) {
  const titleInputId = `${fieldIdPrefix}-title`;
  const promptInputId = `${fieldIdPrefix}-prompt`;
  const intervalInputId = `${fieldIdPrefix}-interval`;
  const categoryInputId = `${fieldIdPrefix}-category`;
  const submitErrorId = `${fieldIdPrefix}-submit-error`;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      aria-busy={submitting}
      noValidate
    >
      <div className="space-y-4 border-b border-border pb-4">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={titleInputId} className="text-xs">
              标题
            </Label>
            <Input
              ref={titleInputRef}
              id={titleInputId}
              name="title"
              type="text"
              autoComplete="off"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="例如：每日科技解读"
              aria-invalid={titleFieldError ? "true" : "false"}
              aria-errormessage={
                titleFieldError ? `${titleInputId}-error` : undefined
              }
            />
            {titleFieldError ? (
              <p
                id={`${titleInputId}-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                {titleFieldError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={promptInputId} className="text-xs">
              AI解读
            </Label>
            <Textarea
              id={promptInputId}
              name="prompt"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="例如：请用要点总结这些文章的核心观点，并给出你的解读与建议。"
              className="min-h-24"
              aria-invalid={promptFieldError ? "true" : "false"}
              aria-errormessage={
                promptFieldError ? `${promptInputId}-error` : undefined
              }
            />
            {promptFieldError ? (
              <p
                id={`${promptInputId}-error`}
                role="alert"
                className="text-xs text-destructive"
              >
                {promptFieldError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                只会解读窗口内新增/更新的文章，并最终纳入相关性最高的 Top 10
                篇。
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">来源</Label>
            <AiDigestSourceTreeSelect
              categories={sourceCategoryOptions}
              feeds={sourceFeedOptions}
              selectedFeedIds={selectedFeedIds}
              onChange={onSelectedFeedIdsChange}
              error={sourcesFieldError}
            />
            {sourcesFieldError ? (
              <p role="alert" className="text-xs text-destructive">
                {sourcesFieldError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={intervalInputId} className="text-xs">
              重复时间
            </Label>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(value) => onIntervalMinutesChange(Number(value))}
            >
              <SelectTrigger id={intervalInputId} className="w-full">
                <SelectValue placeholder="选择重复时间" />
              </SelectTrigger>
              <SelectContent>
                {AI_DIGEST_INTERVAL_OPTIONS_MINUTES.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {formatIntervalOption(minutes)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor={categoryInputId} className="text-xs">
              分类
            </Label>
            <CreatableCategoryField
              inputId={categoryInputId}
              value={categoryInput}
              options={categoryOptions}
              onChange={onCategoryInputChange}
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
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={submitting}
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={submitting}
          aria-describedby={submitError ? submitErrorId : undefined}
        >
          {submitting ? "创建中…" : "创建 AI 解读源"}
        </Button>
      </DialogFooter>
    </form>
  );
}
