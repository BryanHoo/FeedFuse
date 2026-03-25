import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/apiClient';
import { mapApiErrorToUserMessage } from '@/lib/mapApiErrorToUserMessage';
import type { UserOperationActionKey } from '@/lib/userOperationCatalog';
import type { Category } from '../../types';
import { runImmediateOperation } from '../notifications/userOperationNotifier';
import type {
  FeedDialogInitialValues,
  FeedDialogSubmitPayload,
  ValidationState,
} from './feedDialog.types';
import { validateRssUrl } from './services/rssValidationService';

interface UseFeedDialogFormOptions {
  actionKey: UserOperationActionKey;
  categories: Category[];
  initialValues?: Partial<FeedDialogInitialValues>;
  onSubmit: (payload: FeedDialogSubmitPayload) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

interface FieldErrors {
  title?: string;
  url?: string;
}

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

function resolveCategoryPayload(
  categories: Category[],
  input: string,
): Pick<FeedDialogSubmitPayload, 'categoryId' | 'categoryName'> {
  const matchedCategory = findMatchingCategory(categories, input);

  if (isUncategorizedInput(input)) {
    return { categoryId: null };
  }

  if (matchedCategory && matchedCategory.name !== uncategorizedCategory.name) {
    return { categoryId: matchedCategory.id };
  }

  return { categoryName: normalizeCategoryText(input) };
}

function resolveTitleFieldError(title: string, titleTouched: boolean, submitAttempted: boolean): string | null {
  if ((titleTouched || submitAttempted) && !title) {
    return '请输入订阅名称。';
  }

  return null;
}

function resolveUrlFieldError({
  trimmedUrl,
  urlTouched,
  validationState,
  lastVerifiedUrl,
  validationMessage,
}: {
  trimmedUrl: string;
  urlTouched: boolean;
  validationState: ValidationState;
  lastVerifiedUrl: string | null;
  validationMessage: string | null;
}): string | null {
  if (!urlTouched) {
    return null;
  }

  if (!trimmedUrl) {
    return '请输入 RSS 地址。';
  }

  // Blur 触发异步校验后，先展示验证中状态，不要提前渲染失败提示。
  if (validationState === 'validating') {
    return null;
  }

  if (validationState === 'failed') {
    return validationMessage ?? '暂时无法验证该链接，请检查后重试。';
  }

  if (validationState !== 'verified' || lastVerifiedUrl !== trimmedUrl) {
    return '请先验证可用的 RSS 地址。';
  }

  return null;
}

export function useFeedDialogForm({
  actionKey,
  categories,
  initialValues,
  onSubmit,
  onOpenChange,
}: UseFeedDialogFormOptions) {
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
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
  const [titleTouched, setTitleTouched] = useState(false);
  const [urlTouched, setUrlTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const validationRequestIdRef = useRef(0);

  const trimmedTitle = title.trim();
  const trimmedUrl = url.trim();
  const titleFieldError =
    serverFieldErrors.title ?? resolveTitleFieldError(trimmedTitle, titleTouched, submitAttempted);
  const urlFieldError =
    serverFieldErrors.url ??
    resolveUrlFieldError({
      trimmedUrl,
      urlTouched,
      validationState,
      lastVerifiedUrl,
      validationMessage,
    });
  const canSave =
    Boolean(trimmedTitle) &&
    Boolean(trimmedUrl) &&
    validationState === 'verified' &&
    lastVerifiedUrl === trimmedUrl &&
    !submitting;

  const resetValidationState = () => {
    setValidationState('idle');
    setLastVerifiedUrl(null);
    setValidatedSiteUrl(null);
    setValidationMessage(null);
  };

  const focusFirstInvalidField = (errors: { url?: string | null; title?: string | null }) => {
    if (errors.url) {
      urlInputRef.current?.focus();
      return;
    }

    if (errors.title) {
      titleInputRef.current?.focus();
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setSubmitAttempted(true);
    setTitleTouched(true);
    setUrlTouched(true);
    setSubmitError(null);

    const nextTitleError = resolveTitleFieldError(trimmedTitle, true, true);
    const nextUrlError = resolveUrlFieldError({
      trimmedUrl,
      urlTouched: true,
      validationState,
      lastVerifiedUrl,
      validationMessage,
    });

    if (nextTitleError || nextUrlError) {
      focusFirstInvalidField({ url: nextUrlError, title: nextTitleError });
      return;
    }

    void (async () => {
      setSubmitting(true);
      setServerFieldErrors({});

      try {
        await runImmediateOperation({
          actionKey,
          execute: () =>
            onSubmit({
              title: trimmedTitle,
              url: trimmedUrl,
              siteUrl: validatedSiteUrl,
              ...resolveCategoryPayload(categoryOptions, categoryInput),
            }),
        });
        onOpenChange(false);
      } catch (error) {
        if (error instanceof ApiError) {
          setServerFieldErrors({
            title: error.fields?.title,
            url: error.fields?.url,
          });
          focusFirstInvalidField({ url: error.fields?.url, title: error.fields?.title });
        }

        setSubmitError(mapApiErrorToUserMessage(error));
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

  const handleUrlChange = (nextUrl: string) => {
    validationRequestIdRef.current += 1;
    setUrl(nextUrl);
    setUrlTouched(false);
    setSubmitError(null);
    setServerFieldErrors((current) => ({ ...current, url: undefined }));
    resetValidationState();
  };

  const handleUrlBlur = (nextUrl: string) => {
    setUrlTouched(true);
    const blurValue = nextUrl.trim();
    if (validationState === 'verified' && lastVerifiedUrl === blurValue) {
      return;
    }

    void handleValidate(blurValue);
  };

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle);
    setSubmitError(null);
    setServerFieldErrors((current) => ({ ...current, title: undefined }));
  };

  const handleTitleBlur = () => {
    setTitleTouched(true);
  };

  return {
    canSave,
    categoryInput,
    categoryOptions,
    handleSubmit,
    handleTitleBlur,
    handleTitleChange,
    handleUrlBlur,
    handleUrlChange,
    setCategoryInput,
    submitError,
    submitting,
    title,
    titleFieldError,
    titleInputRef,
    url,
    urlFieldError,
    urlInputRef,
    validationMessage,
    validationState,
  };
}
