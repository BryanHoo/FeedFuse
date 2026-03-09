import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type ArticleImagePreviewProps = {
  image: { src: string; alt: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function ArticleImagePreview({
  image,
  open,
  onOpenChange,
}: ArticleImagePreviewProps) {
  const [hasLoadError, setHasLoadError] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel="关闭图片预览"
        showCloseButton={false}
        className="max-w-5xl border-none bg-transparent p-3 shadow-none sm:p-4"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        {image ? (
          <div className="flex max-h-[85vh] items-center justify-center overflow-hidden rounded-md">
            {hasLoadError ? (
              <div className="flex min-h-56 items-center justify-center rounded-md border border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
                图片加载失败，请关闭后重试。
              </div>
            ) : (
              <img
                src={image.src}
                alt={image.alt}
                onError={() => setHasLoadError(true)}
                className="max-h-[80vh] w-auto max-w-full object-contain"
              />
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
