import { describe, expect, it } from 'vitest';
import { fail, ok } from './apiResponse';
import { ConflictError } from './errors';

describe('apiResponse', () => {
  it('returns unified ok envelope', async () => {
    const res = ok({ saved: true });

    expect(await res.json()).toEqual({ ok: true, data: { saved: true } });
  });

  it('returns Chinese-safe fallback for unknown errors', async () => {
    const res = fail(new Error('socket hang up'));

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: {
        code: 'internal_error',
        message: '服务暂时不可用，请稍后重试',
      },
    });
  });

  it('keeps business code and fields for AppError', async () => {
    const res = fail(new ConflictError('订阅源已存在', { url: 'duplicate' }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: {
        code: 'conflict',
        message: '订阅源已存在',
        fields: { url: 'duplicate' },
      },
    });
  });
});
