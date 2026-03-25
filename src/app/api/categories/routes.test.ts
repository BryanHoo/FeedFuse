import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};

const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();
const updateCategoryMock = vi.fn();
const deleteCategoryMock = vi.fn();
const reorderCategoriesMock = vi.fn();
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('../../../server/db/pool', () => ({
  getPool: () => pool,
}));
vi.mock('../../../../server/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('../../../server/repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  updateCategory: (...args: unknown[]) => updateCategoryMock(...args),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  reorderCategories: (...args: unknown[]) => reorderCategoriesMock(...args),
}));
vi.mock('../../../../server/repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  updateCategory: (...args: unknown[]) => updateCategoryMock(...args),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  reorderCategories: (...args: unknown[]) => reorderCategoriesMock(...args),
}));
vi.mock('../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) => writeUserOperationFailedLogMock(...args),
}));
vi.mock('../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) => writeUserOperationFailedLogMock(...args),
}));

const categoryId = '2001';

describe('/api/categories', () => {
  beforeEach(() => {
    listCategoriesMock.mockReset();
    createCategoryMock.mockReset();
    updateCategoryMock.mockReset();
    deleteCategoryMock.mockReset();
    reorderCategoriesMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
  });

  it('GET returns categories', async () => {
    listCategoriesMock.mockResolvedValue([
      { id: categoryId, name: 'Tech', position: 0 },
    ]);

    const mod = await import('./route');
    const res = await mod.GET();
    const json = await res.json();
    expect(json).toEqual({
      ok: true,
      data: [{ id: categoryId, name: 'Tech', position: 0 }],
    });
  });

  it('POST creates category', async () => {
    createCategoryMock.mockResolvedValue({ id: categoryId, name: 'Tech', position: 0 });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tech' }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('Tech');
  });

  it('POST validates body', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.name).toBeTruthy();
  });

  it('POST returns conflict on duplicate', async () => {
    createCategoryMock.mockRejectedValue({
      code: '23505',
      constraint: 'categories_name_unique',
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tech' }),
      }),
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('conflict');
  });

  it('PATCH updates category', async () => {
    updateCategoryMock.mockResolvedValue({
      id: categoryId,
      name: 'Tech 2',
      position: 0,
    });

    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tech 2' }),
      }),
      { params: Promise.resolve({ id: categoryId }) },
    );
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.name).toBe('Tech 2');
  });

  it('PATCH rejects non-numeric id in params', async () => {
    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/categories/not-a-number', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tech 2' }),
      }),
      { params: Promise.resolve({ id: 'not-a-number' }) },
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
  });

  it('PATCH returns not_found when category does not exist', async () => {
    updateCategoryMock.mockResolvedValue(null);

    const mod = await import('./[id]/route');
    const res = await mod.PATCH(
      new Request(`http://localhost/api/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Tech 2' }),
      }),
      { params: Promise.resolve({ id: categoryId }) },
    );
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('not_found');
  });

  it('DELETE deletes category', async () => {
    deleteCategoryMock.mockResolvedValue(true);

    const mod = await import('./[id]/route');
    const res = await mod.DELETE(new Request(`http://localhost/api/categories/${categoryId}`), {
      params: Promise.resolve({ id: categoryId }),
    });
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it('PATCH /api/categories/reorder updates positions', async () => {
    reorderCategoriesMock.mockResolvedValue([
      { id: 'c2', name: '设计', position: 0 },
      { id: 'c1', name: '科技', position: 1 },
    ]);

    const mod = await import('./reorder/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/categories/reorder', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          items: [
            { id: '2002', position: 0 },
            { id: '2001', position: 1 },
          ],
        }),
      }),
    );

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data[0].position).toBe(0);
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ actionKey: 'category.reorder' }),
    );
  });
});
