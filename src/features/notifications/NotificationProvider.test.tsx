import { fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { NotificationProvider } from './NotificationProvider';
import { useNotify } from './useNotify';
import { toastStore } from '../toast/toastStore';

function Probe() {
  const notify = useNotify();

  return (
    <div>
      <button type="button" onClick={() => notify.success('保存成功')}>
        success
      </button>
      <button type="button" onClick={() => notify.info('信息提示')}>
        info
      </button>
      <button type="button" onClick={() => notify.error('操作失败')}>
        error
      </button>
      <button type="button" onClick={() => notify.success('保存成功2')}>
        success-2
      </button>
    </div>
  );
}

describe('NotificationProvider', () => {
  it('renders viewport and shows notifications', async () => {
    toastStore.getState().reset();

    render(
      <NotificationProvider>
        <Probe />
      </NotificationProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'success' }));
    });

    expect(screen.getByTestId('notification-viewport')).toBeInTheDocument();
    expect(await screen.findByText('保存成功')).toBeInTheDocument();
  });
});
