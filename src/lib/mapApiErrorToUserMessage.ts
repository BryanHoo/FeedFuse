import { ApiError } from './apiClient';

export function mapApiErrorToUserMessage(err: unknown): string {
  if (err instanceof ApiError && err.message.trim()) {
    return err.message;
  }

  return '暂时无法完成操作，请稍后重试。';
}

