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
import { normalizeFeedAutoTriggerFlags } from '../../lib/feedAutoTriggerPolicy';
import type { Feed } from '../../types';

export interface FeedSummaryPolicyPatch {
  aiSummaryOnFetchEnabled: boolean;
  aiSummaryOnOpenEnabled: boolean;
}

interface FeedSummaryPolicyDialogProps {
  open: boolean;
  feed: Feed | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (patch: FeedSummaryPolicyPatch) => Promise<void>;
}

export default function FeedSummaryPolicyDialog({
  open,
  feed,
  onOpenChange,
  onSubmit,
}: FeedSummaryPolicyDialogProps) {
  const [aiSummaryOnFetchEnabled, setAiSummaryOnFetchEnabled] = useState(false);
  const [aiSummaryOnOpenEnabled, setAiSummaryOnOpenEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const syncSummaryFlags = (
    patch: {
      aiSummaryOnFetchEnabled?: boolean;
      aiSummaryOnOpenEnabled?: boolean;
    },
    preferredPhase: 'fetch' | 'open',
  ) => {
    const next = normalizeFeedAutoTriggerFlags(
      {
        aiSummaryOnFetchEnabled,
        aiSummaryOnOpenEnabled,
        ...patch,
      },
      preferredPhase,
    );
    setAiSummaryOnFetchEnabled(Boolean(next.aiSummaryOnFetchEnabled));
    setAiSummaryOnOpenEnabled(Boolean(next.aiSummaryOnOpenEnabled));
  };

  useEffect(() => {
    if (!open || !feed) return;
    const next = normalizeFeedAutoTriggerFlags({
      aiSummaryOnFetchEnabled: feed.aiSummaryOnFetchEnabled,
      aiSummaryOnOpenEnabled: feed.aiSummaryOnOpenEnabled,
    });
    setAiSummaryOnFetchEnabled(Boolean(next.aiSummaryOnFetchEnabled));
    setAiSummaryOnOpenEnabled(Boolean(next.aiSummaryOnOpenEnabled));
    setSaving(false);
  }, [feed, open]);

  const handleSave = () => {
    if (!feed || saving) return;

    void (async () => {
      setSaving(true);
      try {
        await onSubmit({
          aiSummaryOnFetchEnabled,
          aiSummaryOnOpenEnabled,
        });
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel="关闭 AI 摘要配置" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
        <DialogHeader>
          <DialogTitle>AI 摘要配置</DialogTitle>
          <DialogDescription>仅保存自动触发规则，现在不会立即生成摘要。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="summary-on-fetch">收到新文章时自动生成摘要</Label>
              <p className="text-xs text-muted-foreground">新文章入库后会自动加入摘要队列。</p>
            </div>
            <Switch
              id="summary-on-fetch"
              aria-label="收到新文章时自动生成摘要"
              checked={aiSummaryOnFetchEnabled}
              onCheckedChange={(checked) =>
                syncSummaryFlags({ aiSummaryOnFetchEnabled: checked }, 'fetch')
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2.5">
            <div className="space-y-1">
              <Label htmlFor="summary-on-open">打开文章时自动生成摘要</Label>
              <p className="text-xs text-muted-foreground">打开文章后会自动加入摘要队列。</p>
            </div>
            <Switch
              id="summary-on-open"
              aria-label="打开文章时自动生成摘要"
              checked={aiSummaryOnOpenEnabled}
              onCheckedChange={(checked) =>
                syncSummaryFlags({ aiSummaryOnOpenEnabled: checked }, 'open')
              }
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
