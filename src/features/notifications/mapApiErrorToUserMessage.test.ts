import { describe, expect, it } from 'vitest';
import { ApiError } from '../../lib/apiClient';
import { mapApiErrorToUserMessage } from './mapApiErrorToUserMessage';

describe('mapApiErrorToUserMessage', () => {
  it('returns ApiError message directly when present', () => {
    const err = new ApiError('订阅源已存在', 'conflict');
    expect(mapApiErrorToUserMessage(err)).toBe('订阅源已存在');
  });

  it('falls back to generic message for unknown error', () => {
    expect(mapApiErrorToUserMessage(new Error('boom'))).toBe('暂时无法完成操作，请稍后重试。');
  });
});
