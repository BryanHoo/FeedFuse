import type { Category } from '../../types';
import FeedDialog, { type FeedDialogSubmitPayload } from './FeedDialog';

interface AddFeedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSubmit: (payload: FeedDialogSubmitPayload) => Promise<void>;
}

export default function AddFeedDialog({ open, onOpenChange, categories, onSubmit }: AddFeedDialogProps) {
  return (
    <FeedDialog
      mode="add"
      open={open}
      onOpenChange={onOpenChange}
      categories={categories}
      onSubmit={onSubmit}
    />
  );
}
