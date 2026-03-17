import type { Category, Feed } from '../../types';
import AiDigestDialog from './AiDigestDialog';

interface AddAiDigestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  feeds: Feed[];
}

export default function AddAiDigestDialog({ open, onOpenChange, categories, feeds }: AddAiDigestDialogProps) {
  return (
    <AiDigestDialog
      mode="add"
      open={open}
      onOpenChange={onOpenChange}
      categories={categories}
      feeds={feeds}
    />
  );
}
