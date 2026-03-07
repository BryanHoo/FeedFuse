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
import { getFeedKeywordFilter, patchFeedKeywordFilter } from '../../lib/apiClient';
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
          setValue(result.keywords.join('\n'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setValue('');
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
        await patchFeedKeywordFilter(feed.id, { keywords: value.split('\n') });
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
      <DialogContent closeLabel="close-keyword-filter" className="max-w-[34rem]">
        <DialogHeader>
          <DialogTitle>配置关键词过滤</DialogTitle>
          <DialogDescription>
            {feed ? `为「${feed.title}」配置文章隐藏关键词。每行一个关键词。` : '为订阅源配置文章隐藏关键词。'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="feed-keyword-filter" className="text-sm font-medium text-foreground">
            订阅源文章关键词隐藏
          </label>
          <textarea
            id="feed-keyword-filter"
            aria-label="订阅源文章关键词隐藏"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={'广告\n招聘\nSponsored'}
            className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
