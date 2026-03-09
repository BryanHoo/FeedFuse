export interface FeedDialogSubmitPayload {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
}

export interface FeedDialogInitialValues {
  title: string;
  url: string;
  siteUrl: string | null;
  categoryId: string | null;
}

export type FeedDialogMode = 'add' | 'edit';

export type ValidationState = 'idle' | 'validating' | 'verified' | 'failed';
