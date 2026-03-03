import type { Category, Feed } from '../../types';
import FeedDialog, { type FeedDialogSubmitPayload } from './FeedDialog';

interface EditFeedDialogProps {
  open: boolean;
  feed: Feed;
  categories: Category[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: FeedDialogSubmitPayload) => Promise<void>;
}

export default function EditFeedDialog({ open, feed, categories, onOpenChange, onSubmit }: EditFeedDialogProps) {
  return (
    <FeedDialog
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      categories={categories}
      initialValues={{
        title: feed.title,
        url: feed.url,
        siteUrl: feed.siteUrl ?? null,
        categoryId: feed.categoryId ?? null,
        fullTextOnOpenEnabled: feed.fullTextOnOpenEnabled,
        aiSummaryOnOpenEnabled: feed.aiSummaryOnOpenEnabled,
        titleTranslateEnabled: feed.titleTranslateEnabled,
        bodyTranslateEnabled: feed.bodyTranslateEnabled,
      }}
      onSubmit={onSubmit}
    />
  );
}
