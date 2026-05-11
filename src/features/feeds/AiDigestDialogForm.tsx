import type { FormEvent, RefObject } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  loadingInitialValues: boolean;
  submitting: boolean;
  submitError: string | null;
  submitButtonLabel: string;
  submittingButtonLabel: string;
  title: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  titleFieldError: string | null;
  onTitleChange: (value: string) => void;
  prompt: string;
  promptFieldError: string | null;
  onPromptChange: (value: string) => void;
  intervalMinutes: number;
  onIntervalMinutesChange: (value: number) => void;
  privateFmEnabled: boolean;
  onPrivateFmEnabledChange: (value: boolean) => void;
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
  loadingInitialValues,
  submitting,
  submitError,
  submitButtonLabel,
  submittingButtonLabel,
  title,
  titleInputRef,
  titleFieldError,
  onTitleChange,
  prompt,
  promptFieldError,
  onPromptChange,
  intervalMinutes,
  onIntervalMinutesChange,
  privateFmEnabled,
  onPrivateFmEnabledChange,
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
  const isBusy = loadingInitialValues || submitting;
  const titleInputId = `${fieldIdPrefix}-title`;
  const titleLabelId = `${fieldIdPrefix}-title-label`;
  const promptInputId = `${fieldIdPrefix}-prompt`;
  const promptLabelId = `${fieldIdPrefix}-prompt-label`;
  const intervalInputId = `${fieldIdPrefix}-interval`;
  const privateFmInputId = `${fieldIdPrefix}-private-fm`;
  const intervalLabelId = `${fieldIdPrefix}-interval-label`;
  const categoryInputId = `${fieldIdPrefix}-category`;
  const categoryLabelId = `${fieldIdPrefix}-category-label`;
  const submitErrorId = `${fieldIdPrefix}-submit-error`;
  // 使用 aria-labelledby 保留可访问名称，同时避免点击 label 触发控件聚焦。

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4"
      aria-busy={isBusy}
      noValidate
    >
      <div className="space-y-4 border-b border-border pb-4">
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <p id={titleLabelId} className="text-xs font-medium leading-none">
              标题
            </p>
            <Input
              ref={titleInputRef}
              id={titleInputId}
              name="title"
              type="text"
              autoComplete="off"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="例如：每日科技智能报告"
              disabled={isBusy}
              aria-labelledby={titleLabelId}
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
            <p id={promptLabelId} className="text-xs font-medium leading-none">
              AI 提示词
            </p>
            <Textarea
              id={promptInputId}
              name="prompt"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="例如：请围绕 AI 行业进展整理主题脉络、关键信号、分歧点与后续建议。"
              className="min-h-24"
              disabled={isBusy}
              aria-labelledby={promptLabelId}
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
                只会检查时间窗口内新增或更新的文章，并把所有可判断为相关的内容纳入本次智能报告。
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <p className="text-xs font-medium leading-none">来源</p>
            <AiDigestSourceTreeSelect
              categories={sourceCategoryOptions}
              feeds={sourceFeedOptions}
              selectedFeedIds={selectedFeedIds}
              onChange={onSelectedFeedIdsChange}
              error={sourcesFieldError}
              disabled={isBusy}
            />
            {sourcesFieldError ? (
              <p role="alert" className="text-xs text-destructive">
                {sourcesFieldError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-1.5">
            <p id={intervalLabelId} className="text-xs font-medium leading-none">
              重复时间
            </p>
            <Select
              value={String(intervalMinutes)}
              onValueChange={(value) => onIntervalMinutesChange(Number(value))}
              disabled={isBusy}
            >
              <SelectTrigger
                id={intervalInputId}
                className="w-full"
                aria-labelledby={intervalLabelId}
              >
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

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <Label htmlFor={privateFmInputId} className="text-xs">
                同时生成私人 FM
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                使用同一批原始新闻生成口播稿和 StepFun TTS 音频。
              </p>
            </div>
            <input
              id={privateFmInputId}
              type="checkbox"
              className="h-5 w-5 shrink-0 accent-primary"
              checked={privateFmEnabled}
              onChange={(event) =>
                onPrivateFmEnabledChange(event.currentTarget.checked)
              }
              disabled={isBusy}
            />
          </div>

          <div className="grid gap-1.5">
            <p id={categoryLabelId} className="text-xs font-medium leading-none">
              分类
            </p>
            <CreatableCategoryField
              inputId={categoryInputId}
              labelledBy={categoryLabelId}
              value={categoryInput}
              options={categoryOptions}
              onChange={onCategoryInputChange}
              disabled={isBusy}
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
          disabled={isBusy}
        >
          取消
        </Button>
        <Button
          type="submit"
          disabled={isBusy}
          aria-describedby={submitError ? submitErrorId : undefined}
        >
          {loadingInitialValues
            ? "加载中…"
            : submitting
            ? submittingButtonLabel
            : submitButtonLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
