import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loginMock = vi.fn();

vi.mock('@/lib/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/lib/apiClient')>('@/lib/apiClient');
  return {
    ...actual,
    login: (...args: unknown[]) => loginMock(...args),
  };
});

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset();
  });

  it('submits password to login api', async () => {
    loginMock.mockImplementation(() => new Promise(() => {}));

    const { default: LoginPage } = await import('./LoginPage');
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'initial-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入 FeedFuse' }));

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ password: 'initial-password' });
    });
  });

  it('shows api error message when login fails', async () => {
    const { ApiError } = await import('@/lib/apiClient');
    loginMock.mockRejectedValue(new ApiError('密码错误，请重试', 'unauthorized'));

    const { default: LoginPage } = await import('./LoginPage');
    render(<LoginPage />);

    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '进入 FeedFuse' }));

    expect(await screen.findByText('密码错误，请重试')).toBeInTheDocument();
  });
});
