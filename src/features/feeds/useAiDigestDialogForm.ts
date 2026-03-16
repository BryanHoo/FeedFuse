import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/apiClient';
import { mapApiErrorToUserMessage } from '@/lib/mapApiErrorToUserMessage';
import type { Category, Feed } from '../../types';
import { useAppStore } from '../../store/appStore';
import { toast } from '../toast/toast';

export const AI_DIGEST_INTERVAL_OPTIONS_MINUTES = [60, 120, 240, 480, 1440] as const;

type AiDigestIntervalMinutes = (typeof AI_DIGEST_INTERVAL_OPTIONS_MINUTES)[number];

type CategoryResolutionInput = {
  categoryId?: string | null;
  categoryName?: string | null;
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

function resolveCategoryPayload(categories: Category[], input: string): CategoryResolutionInput {
  const matchedCategory = findMatchingCategory(categories, input);

  if (isUncategorizedInput(input)) {
    return { categoryId: null };
  }

  if (matchedCategory && matchedCategory.name !== uncategorizedCategory.name) {
    return { categoryId: matchedCategory.id };
  }

  return { categoryName: normalizeCategoryText(input) };
}

export function useAiDigestDialogForm(input: {
  categories: Category[];
  feeds: Feed[];
  onOpenChange: (open: boolean) => void;
}) {
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const addAiDigest = useAppStore((state) => state.addAiDigest);
  const categoryOptions = useMemo(() => ensureCategoryOptions(input.categories), [input.categories]);
  const sourceFeedOptions = useMemo(() => input.feeds, [input.feeds]);
  const sourceCategoryOptions = useMemo(() => ensureCategoryOptions(input.categories), [input.categories]);

  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState<AiDigestIntervalMinutes>(60);
  const [categoryInput, setCategoryInput] = useState(uncategorizedCategory.name);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedPrompt = prompt.trim();
  const hasSources = selectedFeedIds.length > 0;

  const titleFieldError =
    serverFieldErrors.title ?? (submitAttempted && !trimmedTitle ? '标题为必填项' : null);
  const promptFieldError =
    serverFieldErrors.prompt ?? (submitAttempted && !trimmedPrompt ? 'AI解读提示词为必填项' : null);
  const sourcesFieldError =
    serverFieldErrors.selectedFeedIds ??
    (submitAttempted && !hasSources ? '请至少选择一个来源' : null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitAttempted(true);
    setSubmitError(null);
    setServerFieldErrors({});

    if (!trimmedTitle || !trimmedPrompt || !hasSources) {
      return;
    }

    setSubmitting(true);

    try {
      const categoryPayload = resolveCategoryPayload(categoryOptions, categoryInput);

      // Keep payload aligned with server Zod schema keys.
      await addAiDigest({
        title: trimmedTitle,
        prompt: trimmedPrompt,
        intervalMinutes,
        selectedFeedIds,
        ...categoryPayload,
      });

      toast.success('已创建 AI解读源');
      input.onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setServerFieldErrors(err.fields ?? {});
        setSubmitError(mapApiErrorToUserMessage(err));
        return;
      }

      setSubmitError('暂时无法创建 AI解读源，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return {
    titleInputRef,
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
    setSelectedFeedIds,
    titleFieldError,
    promptFieldError,
    sourcesFieldError,
    handleSubmit,
  };
}
