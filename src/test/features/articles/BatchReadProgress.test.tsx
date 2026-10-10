import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), retry: vi.fn(), snapshot: vi.fn() }));
vi.mock('@/lib/api/apiClient', () => ({ listFeverBatchReadTasks: mocks.list, retryFeverBatchReadTask: mocks.retry }));
vi.mock('@/store/appStore', () => ({ useAppStore: { getState: () => ({ loadSnapshot: mocks.snapshot }) } }));
vi.mock('@/store/authStore', () => ({ getCurrentStorageUserId: () => '2' }));
import { BatchReadProgress } from '@/features/articles/components/BatchReadProgress';
import { useBatchReadStore } from '@/features/articles/batchReadStore';
const failedTask = { id: '7', feedId: '5', status: 'failed' as const, totalCount: 3, succeededCount: 2, failedCount: 1, localUpdatedCount: 0, failures: [{ articleId: '11', title: '失败文章', errorMessage: 'Fever 请求超时，请重试' }] };
beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset());
  useBatchReadStore.getState().setScope('2');
  useBatchReadStore.setState({ tasks: [], observed: [], dismissed: [], revision: 0 });
  mocks.list.mockResolvedValue({ tasks: [failedTask] });
  mocks.snapshot.mockResolvedValue(undefined);
});
describe('批量已读进度', () => {
  it('从服务端恢复进度和失败原因，允许仅重试失败项', async () => {
    mocks.retry.mockResolvedValue({ task: { ...failedTask, status: 'queued', failedCount: 0, failures: [] } });
    render(<BatchReadProgress userId="2" />);
    expect(await screen.findByText('成功 2 篇，失败 1 篇')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看失败项（1）'));
    expect(screen.getByText('失败文章')).toBeInTheDocument();
    expect(screen.getByText('Fever 请求超时，请重试')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试失败项' }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith('7', { notifyOnError: false }));
  });
  it('轮询失败保留任务进度并提供重新查询', async () => {
    mocks.list.mockRejectedValue(new Error('offline'));
    useBatchReadStore.getState().track({ ...failedTask, status: 'running', failedCount: 0, failures: [] }, '2');
    render(<BatchReadProgress userId="2" />);
    expect(await screen.findByText('进度暂时无法更新，任务仍在后台执行')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '2');
    expect(screen.getByRole('button', { name: '重新查询' })).toBeInTheDocument();
  });
  it('新任务只显示受理进度，完成后刷新实际文章状态', async () => {
    mocks.list.mockResolvedValue({ tasks: [] });
    render(<BatchReadProgress userId="2" />);
    await act(async () => { useBatchReadStore.getState().track({ ...failedTask, status: 'running', failedCount: 0, failures: [] }, '2'); });
    expect(screen.getByText('正在标记已读：2/3')).toBeInTheDocument();
    mocks.list.mockResolvedValue({ tasks: [{ ...failedTask, status: 'succeeded', succeededCount: 3, failedCount: 0, failures: [] }] });
    act(() => useBatchReadStore.getState().refresh());
    expect(await screen.findByText('成功 3 篇，失败 0 篇')).toBeInTheDocument();
    await waitFor(() => expect(mocks.snapshot).toHaveBeenCalled());
  });
});
