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
import {
  getFeedKeywordFilter,
  patchFeedKeywordFilter,
} from '../../lib/apiClient';
import { useAppStore } from '../../store/appStore';
import type { Feed } from '../../types';

interface FeedKeywordFilterDialogProps {
  open: boolean;
  feed: Feed | null;
  onOpenChange: (open: boolean) => void;
}

export default function FeedKeywordFilterDialog({
  open,
  feed,
  onOpenChange,
}: FeedKeywordFilterDialogProps) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !feed) {
      return;
    }

    let cancelled = false;
    setSaving(false);

    void getFeedKeywordFilter(feed.id)
      .then((result) => {
        if (!cancelled) {
          setValue(result.keywords.join("\n"));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValue("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [feed, open]);

  const handleSave = () => {
    if (!feed || saving) {
      return;
    }

    void (async () => {
      setSaving(true);
      try {
        await patchFeedKeywordFilter(feed.id, { keywords: value.split("\n") });
        const { selectedView, loadSnapshot } = useAppStore.getState();
        await loadSnapshot({ view: selectedView });
        onOpenChange(false);
      } finally {
        setSaving(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel="close-keyword-filter"
        className={DIALOG_FORM_CONTENT_CLASS_NAME}
      >
        <DialogHeader>
          <DialogTitle>配置关键词过滤</DialogTitle>
          <DialogDescription>
            {feed
              ? `为「${feed.title}」设置文章过滤规则。`
              : '为订阅源设置文章过滤规则。'}
            <br />
            每行输入一个关键词。只要标题或摘要包含该关键词，这篇文章就不会显示在列表中。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <textarea
            id="feed-keyword-filter"
            aria-label="文章关键词过滤规则"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={"广告\n招聘\nSponsored"}
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !feed}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
