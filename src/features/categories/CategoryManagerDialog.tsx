import CategoryManagerPanel from './CategoryManagerPanel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CategoryManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CategoryManagerDialog({
  open,
  onOpenChange,
}: CategoryManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="close-category-manager" className="max-h-[85vh] max-w-4xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>分类管理</DialogTitle>
          <DialogDescription>管理分类的创建、重命名、删除和排序。</DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto px-6 py-5">
          <CategoryManagerPanel />
        </div>
      </DialogContent>
    </Dialog>
  );
}
