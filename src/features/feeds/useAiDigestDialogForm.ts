import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/apiClient";
import { mapApiErrorToUserMessage } from "@/lib/mapApiErrorToUserMessage";
import type { Category, Feed } from "../../types";
import { useAppStore } from "../../store/appStore";
import { runImmediateOperation } from "../notifications/userOperationNotifier";

export const AI_DIGEST_INTERVAL_OPTIONS_MINUTES = [
  60, 120, 240, 480, 1440,
] as const;

type AiDigestIntervalMinutes =
  (typeof AI_DIGEST_INTERVAL_OPTIONS_MINUTES)[number];

type CategoryResolutionInput = {
  categoryId?: string | null;
  categoryName?: string | null;
};

type AiDigestDialogMode = "add" | "edit";

type UseAiDigestDialogFormInput = {
  mode: AiDigestDialogMode;
  categories: Category[];
  feeds: Feed[];
  onOpenChange: (open: boolean) => void;
  feedId?: string;
  initialTitle?: string;
  initialCategoryId?: string | null;
};

const uncategorizedCategory: Category = {
  id: "cat-uncategorized",
  name: "未分类",
  expanded: true,
};

function normalizeCategoryText(value: string | null | undefined): string {
  return value?.trim() ?? "";
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
  categories: Category[],
  initialCategoryId?: string | null,
): string {
  if (!initialCategoryId) {
    return uncategorizedCategory.name;
  }

  const matchedCategory = categories.find((item) => item.id === initialCategoryId);
  return matchedCategory?.name ?? uncategorizedCategory.name;
}

function findMatchingCategory(
  categories: Category[],
  input: string,
): Category | undefined {
  const normalizedInput = normalizeCategoryText(input);
  if (!normalizedInput) return undefined;

  const normalizedKey = normalizedInput.toLowerCase();
  return categories.find(
    (item) =>
      item.id === normalizedInput ||
      normalizeCategoryKey(item.name) === normalizedKey,
  );
}

function isUncategorizedInput(value: string): boolean {
  return (
    !normalizeCategoryText(value) ||
    normalizeCategoryKey(value) ===
      normalizeCategoryKey(uncategorizedCategory.name)
  );
}

function resolveCategoryPayload(
  categories: Category[],
  input: string,
): CategoryResolutionInput {
  const matchedCategory = findMatchingCategory(categories, input);

  if (isUncategorizedInput(input)) {
    return { categoryId: null };
  }

  if (matchedCategory && matchedCategory.name !== uncategorizedCategory.name) {
    return { categoryId: matchedCategory.id };
  }

  return { categoryName: normalizeCategoryText(input) };
}

function normalizeSelectedFeedIds(
  feedIds: string[],
  sourceFeedOptions: Feed[],
): string[] {
  const rssFeedIds = new Set(
    sourceFeedOptions
      .filter((feed) => feed.kind === "rss")
      .map((feed) => feed.id),
  );

  return [...new Set(feedIds.filter((id) => rssFeedIds.has(id)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function useAiDigestDialogForm(input: UseAiDigestDialogFormInput) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const addAiDigest = useAppStore((state) => state.addAiDigest);
  const getAiDigestConfig = useAppStore((state) => state.getAiDigestConfig);
  const updateAiDigest = useAppStore((state) => state.updateAiDigest);
  const categoryOptions = useMemo(
    () => ensureCategoryOptions(input.categories),
    [input.categories],
  );
  const sourceFeedOptions = useMemo(() => input.feeds, [input.feeds]);
  const sourceCategoryOptions = useMemo(
    () => ensureCategoryOptions(input.categories),
    [input.categories],
  );
  const isEditMode = input.mode === "edit";

  const [title, setTitle] = useState(input.initialTitle ?? "");
  const [prompt, setPrompt] = useState("");
  const [intervalMinutes, setIntervalMinutes] =
    useState<AiDigestIntervalMinutes>(60);
  const [categoryInput, setCategoryInput] = useState(() =>
    resolveInitialCategoryInput(categoryOptions, input.initialCategoryId),
  );
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<
    Record<string, string>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingInitialValues, setLoadingInitialValues] = useState(isEditMode);

  useEffect(() => {
    if (!isEditMode) {
      setLoadingInitialValues(false);
      return;
    }
    if (!input.feedId) {
      setLoadingInitialValues(false);
      setSubmitError("缺少 AI 解读源 ID，无法编辑");
      return;
    }

    let cancelled = false;
    setLoadingInitialValues(true);
    setSubmitError(null);

    void (async () => {
      try {
        const config = await getAiDigestConfig(input.feedId!);
        if (cancelled) return;

        const nextIntervalMinutes =
          AI_DIGEST_INTERVAL_OPTIONS_MINUTES.includes(
            config.intervalMinutes as never,
          )
            ? (config.intervalMinutes as AiDigestIntervalMinutes)
            : 60;

        // 编辑模式只保留当前仍可选的 RSS 来源，避免历史脏数据干扰表单。
        setPrompt(config.prompt);
        setIntervalMinutes(nextIntervalMinutes);
        setSelectedFeedIds(
          normalizeSelectedFeedIds(config.selectedFeedIds, sourceFeedOptions),
        );
      } catch {
        if (cancelled) return;
        setSubmitError("暂时无法加载 AI 解读源配置，请稍后重试");
      } finally {
        if (!cancelled) {
          setLoadingInitialValues(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getAiDigestConfig, input.feedId, isEditMode, sourceFeedOptions]);

  const trimmedTitle = title.trim();
  const trimmedPrompt = prompt.trim();
  const hasSources = selectedFeedIds.length > 0;

  const titleFieldError =
    serverFieldErrors.title ??
    (submitAttempted && !trimmedTitle ? "标题为必填项" : null);
  const promptFieldError =
    serverFieldErrors.prompt ??
    (submitAttempted && !trimmedPrompt ? "AI 提示词为必填项" : null);
  const sourcesFieldError =
    serverFieldErrors.selectedFeedIds ??
    (submitAttempted && !hasSources ? "请至少选择一个来源" : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (loadingInitialValues) {
      return;
    }

    setSubmitAttempted(true);
    setSubmitError(null);
    setServerFieldErrors({});

    if (!trimmedTitle || !trimmedPrompt || !hasSources) {
      return;
    }

    setSubmitting(true);

    try {
      const categoryPayload = resolveCategoryPayload(
        categoryOptions,
        categoryInput,
      );

      // 保持 payload 与服务端 Zod schema 字段命名一致。
      if (isEditMode) {
        if (!input.feedId) {
          setSubmitError("缺少 AI 解读源 ID，无法编辑");
          return;
        }

        await runImmediateOperation({
          actionKey: "aiDigest.update",
          execute: () =>
            updateAiDigest(input.feedId!, {
              title: trimmedTitle,
              prompt: trimmedPrompt,
              intervalMinutes,
              selectedFeedIds,
              ...categoryPayload,
            }),
        });
      } else {
        await runImmediateOperation({
          actionKey: "aiDigest.create",
          execute: () =>
            addAiDigest({
              title: trimmedTitle,
              prompt: trimmedPrompt,
              intervalMinutes,
              selectedFeedIds,
              ...categoryPayload,
            }),
        });
      }

      input.onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerFieldErrors(err.fields ?? {});
        setSubmitError(mapApiErrorToUserMessage(err));
        return;
      }

      setSubmitError(
        isEditMode
          ? "暂时无法更新 AI 解读源，请稍后重试"
          : "暂时无法创建 AI 解读源，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return {
    titleInputRef,
    loadingInitialValues,
    submitting,
    submitError,
    title,
    setTitle,
    prompt,
    setPrompt,
    intervalMinutes,
    setIntervalMinutes: (nextValue: number) => {
      if (AI_DIGEST_INTERVAL_OPTIONS_MINUTES.includes(nextValue as never)) {
        setIntervalMinutes(nextValue as AiDigestIntervalMinutes);
      }
    },
    categoryInput,
    setCategoryInput,
    categoryOptions,
    sourceFeedOptions,
    sourceCategoryOptions,
    selectedFeedIds,
    setSelectedFeedIds: (nextValue: string[]) => {
      setSelectedFeedIds(normalizeSelectedFeedIds(nextValue, sourceFeedOptions));
    },
    titleFieldError,
    promptFieldError,
    sourcesFieldError,
    handleSubmit,
  };
}
