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

export interface FeedFulltextPolicyPatch {
  fullTextOnOpenEnabled: boolean;
  fullTextOnFetchEnabled: boolean;
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
  const [fullTextOnFetchEnabled, setFullTextOnFetchEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !feed) return;
    setFullTextOnOpenEnabled(feed.fullTextOnOpenEnabled);
    setFullTextOnFetchEnabled(feed.fullTextOnFetchEnabled);
    setSaving(false);
  }, [feed, open]);

  const handleSave = () => {
    if (!feed || saving) return;

    void (async () => {
      setSaving(true);
      try {
        await onSubmit({ fullTextOnOpenEnabled, fullTextOnFetchEnabled });
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="close-fulltext-policy" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>全文抓取配置</DialogTitle>
          <DialogDescription>分别控制阅读时补全文和入库过滤前补全文，两者不会立即触发抓取。</DialogDescription>
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

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="fulltext-on-fetch">入库时自动抓取全文</Label>
              <p className="text-xs text-muted-foreground">新文章进入过滤链路时会优先尝试抓取全文，再决定是否展示。</p>
            </div>
            <Switch
              id="fulltext-on-fetch"
              aria-label="入库时自动抓取全文"
              checked={fullTextOnFetchEnabled}
              onCheckedChange={setFullTextOnFetchEnabled}
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
