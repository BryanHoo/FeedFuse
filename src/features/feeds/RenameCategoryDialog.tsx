import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RenameCategoryDialogProps {
  open: boolean;
  category: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<void>;
}

function getRenameErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'conflict') {
    return '分类已存在';
  }

  return '操作失败，请稍后重试。';
}

export default function RenameCategoryDialog({
  open,
  category,
  onOpenChange,
  onSubmit,
}: RenameCategoryDialogProps) {
  const [name, setName] = useState(category?.name ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setErrorMessage(null);
    setSubmitting(false);
  }, [open, category?.id, category?.name]);

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('请输入分类名称。');
      return;
    }

    if (!category) return;

    void (async () => {
      setSubmitting(true);
      setErrorMessage(null);

      try {
        await onSubmit(trimmedName);
        onOpenChange(false);
      } catch (error) {
        setErrorMessage(getRenameErrorMessage(error));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="关闭重命名分类" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>重命名分类</DialogTitle>
          <DialogDescription className="break-words">
            {category ? `更新「${category.name}」的分类名称。` : '更新分类名称。'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="rename-category-name" className="text-xs">
            分类名称
          </Label>
          <Input
            id="rename-category-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleSubmit();
              }
            }}
            autoComplete="off"
          />
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
