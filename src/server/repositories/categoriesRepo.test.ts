import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  findCategoryByNormalizedName,
  getNextCategoryPosition,
  reorderCategories,
} from './categoriesRepo';

describe('reorderCategories', () => {
  it('updates positions in a transaction and returns sorted rows', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ id: 'c1' }, { id: 'c2' }] })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [
          { id: 'c2', name: '设计', position: 0 },
          { id: 'c1', name: '科技', position: 1 },
        ],
      })
      .mockResolvedValueOnce(undefined);

    const pool = { query } as unknown as Pool;

    const rows = await reorderCategories(pool, [
      { id: 'c2', position: 0 },
      { id: 'c1', position: 1 },
    ]);

    expect(rows.map((item) => item.id)).toEqual(['c2', 'c1']);
    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(query).toHaveBeenLastCalledWith('commit');
    const updateSql = String(query.mock.calls[2]?.[0] ?? '');
    const selectSql = String(query.mock.calls[1]?.[0] ?? '');
    expect(selectSql).toContain('any($1::bigint[])');
    expect(updateSql).toContain('unnest($1::bigint[])');
  });
});

describe('findCategoryByNormalizedName', () => {
  it('trims input before querying and returns the first row', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: 'c1', name: 'Tech', position: 2 }],
    });

    const pool = { query } as unknown as Pool;

    const row = await findCategoryByNormalizedName(pool, '  Tech  ');

    expect(row).toEqual({ id: 'c1', name: 'Tech', position: 2 });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('lower(btrim(name)) = lower(btrim($1))'),
      ['Tech'],
    );
  });
});

describe('getNextCategoryPosition', () => {
  it('returns the next available position after the current max', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ nextPosition: 4 }],
    });

    const pool = { query } as unknown as Pool;

    const nextPosition = await getNextCategoryPosition(pool);

    expect(nextPosition).toBe(4);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('coalesce(max(position), -1) + 1'),
    );
  });
});
