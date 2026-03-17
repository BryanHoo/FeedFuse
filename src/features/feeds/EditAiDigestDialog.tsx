import type { Category, Feed } from "../../types";
import AiDigestDialog from "./AiDigestDialog";

interface EditAiDigestDialogProps {
  open: boolean;
  feed: Feed;
  categories: Category[];
  feeds: Feed[];
  onOpenChange: (open: boolean) => void;
}

export default function EditAiDigestDialog({
  open,
  feed,
  categories,
  feeds,
  onOpenChange,
}: EditAiDigestDialogProps) {
  return (
    <AiDigestDialog
      mode="edit"
      open={open}
      onOpenChange={onOpenChange}
      categories={categories}
      feeds={feeds}
      feedId={feed.id}
      initialTitle={feed.title}
      initialCategoryId={feed.categoryId ?? null}
    />
  );
}
