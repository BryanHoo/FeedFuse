import { describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError } from './errors';

describe('errors', () => {
  it('serializes validation fields', () => {
    const err = new ValidationError('bad', { url: 'invalid' });
    expect(err.fields.url).toBe('invalid');
  });

  it('provides Chinese defaults for common AppError subclasses', () => {
    expect(new NotFoundError().message).toBe('目标不存在');
    expect(new ConflictError().message).toBe('操作冲突，请稍后重试');
  });
});
