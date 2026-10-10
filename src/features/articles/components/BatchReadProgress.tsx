'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { listFeverBatchReadTasks, retryFeverBatchReadTask } from '@/lib/api/apiClient';
import { useAppStore } from '@/store/appStore';
import { getCurrentStorageUserId } from '@/store/authStore';
import { useBatchReadStore } from '../batchReadStore';
import type { FeverBatchReadTask } from '@/types/feverBatchRead';

const isPending = (task: FeverBatchReadTask) => task.status === 'queued' || task.status === 'running';

function BatchReadTaskCard({ task }: { task: FeverBatchReadTask }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = isPending(task);
  const completed = task.succeededCount + task.failedCount;

  const retry = async () => {
    if (retrying) return;
    const userId = getCurrentStorageUserId();
    setRetrying(true);
    setError(null);
    try {
      const { task: next } = await retryFeverBatchReadTask(task.id, { notifyOnError: false });
      if (getCurrentStorageUserId() === userId) useBatchReadStore.getState().track(next, userId);
    } catch {
      setError('重试未能提交，请稍后再试');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-background p-3 shadow-sm" aria-label="Fever 批量已读任务">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium" role="status">{pending ? `正在标记已读：${completed}/${task.totalCount}` : `成功 ${task.succeededCount} 篇，失败 ${task.failedCount} 篇`}</p>
        {!pending && <Button variant="ghost" size="sm" onClick={() => useBatchReadStore.getState().dismiss(task.id)} aria-label="关闭批量已读进度">关闭</Button>}
      </div>
      <progress className="mt-2 h-2 w-full accent-primary" value={completed} max={task.totalCount || 1} aria-label="批量已读进度" />
      {task.localUpdatedCount > 0 && <p className="mt-1 text-xs text-muted-foreground">本地订阅已读 {task.localUpdatedCount} 篇</p>}
      {task.failedCount > 0 && (
        <>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">查看失败项（{task.failedCount}）</summary>
            <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
              {task.failures.map((item) => <li key={item.articleId}><p className="font-medium">{item.title || `文章 ${item.articleId}`}</p><p className="text-muted-foreground">{item.errorMessage}</p></li>)}
            </ul>
          </details>
          <Button className="mt-2" variant="outline" size="sm" disabled={pending || retrying} onClick={() => void retry()}>{retrying ? '正在提交…' : '重试失败项'}</Button>
        </>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </section>
  );
}

export function BatchReadProgress({ userId }: { userId: string }) {
  const state = useBatchReadStore();
  const [queryError, setQueryError] = useState(false);
  const previousProgress = useRef('');

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    useBatchReadStore.getState().setScope(userId);
    const poll = async () => {
      try {
        const { tasks } = await listFeverBatchReadTasks({ notifyOnError: false });
        if (cancelled || getCurrentStorageUserId() !== userId) return;
        useBatchReadStore.getState().merge(tasks, userId);
        setQueryError(false);
        const progress = tasks.map((task) => `${task.id}:${task.succeededCount}:${task.failedCount}:${task.status}`).join('|');
        // 逐项结果变化后重新读取服务端快照，部分成功时不把剩余文章和未读数直接清零。
        if (progress !== previousProgress.current && tasks.length > 0) {
          previousProgress.current = progress;
          void useAppStore.getState().loadSnapshot();
        }
        if (useBatchReadStore.getState().tasks.some(isPending)) timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (cancelled) return;
        setQueryError(true);
        timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [userId, state.revision]);

  const tasks = state.userId === userId ? state.tasks.filter((task) =>
    !state.dismissed.includes(task.id) && (isPending(task) || task.failedCount > 0 || state.observed.includes(task.id)),
  ) : [];
  if (tasks.length === 0 && !queryError) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-40 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto" aria-label="批量已读进度">
      {tasks.map((task) => <BatchReadTaskCard key={task.id} task={task} />)}
      {queryError && <div className="rounded-lg border border-border bg-background p-3 text-xs"><p>{tasks.some(isPending) ? '进度暂时无法更新，任务仍在后台执行' : '无法查询批量已读任务，请重试'}</p><Button className="mt-2" variant="outline" size="sm" onClick={() => useBatchReadStore.getState().refresh()}>重新查询</Button></div>}
    </aside>
  );
}
