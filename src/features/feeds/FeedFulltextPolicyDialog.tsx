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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Feed } from '../../types';

export interface FeedFulltextPolicyPatch {
  fullTextOnOpenEnabled: boolean;
}

interface FeedFulltextPolicyDialogProps {
  open: boolean;
  feed: Feed | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (patch: FeedFulltextPolicyPatch) => Promise<void>;
}

export default function FeedFulltextPolicyDialog({
  open,
  feed,
  onOpenChange,
  onSubmit,
}: FeedFulltextPolicyDialogProps) {
  const [fullTextOnOpenEnabled, setFullTextOnOpenEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !feed) return;
    setFullTextOnOpenEnabled(feed.fullTextOnOpenEnabled);
    setSaving(false);
  }, [feed, open]);

  const handleSave = () => {
    if (!feed || saving) return;

    void (async () => {
      setSaving(true);
      try {
        await onSubmit({ fullTextOnOpenEnabled });
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="close-fulltext-policy" className="max-w-[34rem]">
        <DialogHeader>
          <DialogTitle>全文抓取配置</DialogTitle>
          <DialogDescription>仅保存自动触发规则，现在不会立即抓取全文。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="fulltext-on-open">打开文章时自动抓取全文</Label>
              <p className="text-xs text-muted-foreground">打开文章后会自动尝试补齐全文内容。</p>
            </div>
            <Switch
              id="fulltext-on-open"
              aria-label="打开文章时自动抓取全文"
              checked={fullTextOnOpenEnabled}
              onCheckedChange={setFullTextOnOpenEnabled}
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
