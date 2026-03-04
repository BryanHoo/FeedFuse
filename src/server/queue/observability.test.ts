import type { PgBoss } from 'pg-boss';
import { describe, expect, it, vi } from 'vitest';
import { attachBossObservers } from './observability';

describe('attachBossObservers', () => {
  it('attaches error/warning/stopped listeners', () => {
    const on = vi.fn();
    attachBossObservers({
      on,
    } as unknown as Pick<PgBoss, 'on'>);

    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(on).toHaveBeenCalledWith('warning', expect.any(Function));
    expect(on).toHaveBeenCalledWith('stopped', expect.any(Function));
  });
});
