import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DIALOG_FORM_CONTENT_CLASS_NAME } from '@/lib/designSystem';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Feed } from '../../types';

export interface FeedTranslationPolicyPatch {
  titleTranslateEnabled: boolean;
  bodyTranslateOnFetchEnabled: boolean;
  bodyTranslateOnOpenEnabled: boolean;
}

interface FeedTranslationPolicyDialogProps {
  open: boolean;
  feed: Feed | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (patch: FeedTranslationPolicyPatch) => Promise<void>;
}

function resolveInitialBodyTranslateOnOpenEnabled(feed: Feed): boolean {
  return feed.bodyTranslateOnOpenEnabled || (!feed.bodyTranslateOnOpenEnabled && feed.bodyTranslateEnabled);
}

export default function FeedTranslationPolicyDialog({
  open,
  feed,
  onOpenChange,
  onSubmit,
}: FeedTranslationPolicyDialogProps) {
  const [titleTranslateEnabled, setTitleTranslateEnabled] = useState(false);
  const [bodyTranslateOnFetchEnabled, setBodyTranslateOnFetchEnabled] = useState(false);
  const [bodyTranslateOnOpenEnabled, setBodyTranslateOnOpenEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !feed) return;
    setTitleTranslateEnabled(feed.titleTranslateEnabled);
    setBodyTranslateOnFetchEnabled(feed.bodyTranslateOnFetchEnabled);
    setBodyTranslateOnOpenEnabled(resolveInitialBodyTranslateOnOpenEnabled(feed));
    setSaving(false);
  }, [feed, open]);

  const handleSave = () => {
    if (!feed || saving) return;

    void (async () => {
      setSaving(true);
      try {
        await onSubmit({
          titleTranslateEnabled,
          bodyTranslateOnFetchEnabled,
          bodyTranslateOnOpenEnabled,
        });
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="close-translation-policy" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>翻译配置</DialogTitle>
          <DialogDescription>仅保存自动触发规则，现在不会立即开始翻译。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="translation-title">收到新文章时自动翻译标题</Label>
              <p className="text-xs text-muted-foreground">新文章入库后自动翻译标题。</p>
            </div>
            <Switch
              id="translation-title"
              aria-label="收到新文章时自动翻译标题"
              checked={titleTranslateEnabled}
              onCheckedChange={setTitleTranslateEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="translation-body-fetch">收到新文章时自动翻译正文</Label>
              <p className="text-xs text-muted-foreground">新文章入库后会自动加入正文翻译队列。</p>
            </div>
            <Switch
              id="translation-body-fetch"
              aria-label="收到新文章时自动翻译正文"
              checked={bodyTranslateOnFetchEnabled}
              onCheckedChange={setBodyTranslateOnFetchEnabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="translation-body-open">打开文章时自动翻译正文</Label>
              <p className="text-xs text-muted-foreground">打开文章后会自动加入正文翻译队列。</p>
            </div>
            <Switch
              id="translation-body-open"
              aria-label="打开文章时自动翻译正文"
              checked={bodyTranslateOnOpenEnabled}
              onCheckedChange={setBodyTranslateOnOpenEnabled}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !feed}>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
