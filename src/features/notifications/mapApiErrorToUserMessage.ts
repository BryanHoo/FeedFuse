import { ApiError } from '../../lib/apiClient';

export function mapApiErrorToUserMessage(err: unknown): string {
  if (err instanceof ApiError && err.message.trim()) {
    return err.message;
  }

  return '操作失败，请稍后重试。';
}
