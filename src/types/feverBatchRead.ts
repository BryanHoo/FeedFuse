export interface FeverBatchReadTask {
  id: string;
  feedId: string | null;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  localUpdatedCount: number;
  failures: Array<{ articleId: string; title: string; errorMessage: string }>;
}

export interface FeverBatchReadItemJob {
  runId: string;
  userId: string;
  articleId: string;
  feverAccountId: string;
  feverItemId: string;
  attempt: number;
}

export interface MarkAllReadResult {
  updatedCount: number;
  task: FeverBatchReadTask | null;
}
