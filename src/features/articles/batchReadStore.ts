import { create } from 'zustand';
import type { FeverBatchReadTask } from '@/types/feverBatchRead';

interface BatchReadState {
  userId: string | null;
  tasks: FeverBatchReadTask[];
  dismissed: string[];
  observed: string[];
  revision: number;
  setScope: (userId: string) => void;
  track: (task: FeverBatchReadTask, userId: string) => void;
  merge: (tasks: FeverBatchReadTask[], userId: string) => void;
  dismiss: (id: string) => void;
  refresh: () => void;
}

export const useBatchReadStore = create<BatchReadState>((set) => ({
  userId: null, tasks: [], dismissed: [], observed: [], revision: 0,
  setScope: (userId) => set((state) => state.userId === userId ? {} : { userId, tasks: [], dismissed: [], observed: [], revision: 0 }),
  track: (task, userId) => set((state) => ({
    userId,
    tasks: [task, ...(state.userId === userId ? state.tasks.filter((t) => t.id !== task.id) : [])],
    dismissed: state.userId === userId ? state.dismissed.filter((id) => id !== task.id) : [],
    observed: [...new Set([...(state.userId === userId ? state.observed : []), task.id])],
    revision: state.revision + 1,
  })),
  merge: (tasks, userId) => set((state) => {
    if (state.userId !== userId) return {};
    const incoming = new Map(tasks.map((task) => [task.id, task]));
    // 保留刚受理但尚未出现在并发查询中的任务，避免进度闪退。
    const previous = state.tasks.filter((task) => !incoming.has(task.id));
    return {
      tasks: [...tasks, ...previous],
      observed: [...new Set([...state.observed, ...tasks.filter((task) => task.status === 'queued' || task.status === 'running').map((task) => task.id)])],
    };
  }),
  dismiss: (id) => set((state) => ({ dismissed: [...state.dismissed, id] })),
  refresh: () => set((state) => ({ revision: state.revision + 1 })),
}));
