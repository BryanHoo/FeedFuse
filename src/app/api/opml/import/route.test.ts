import { beforeEach, describe, expect, it, vi } from 'vitest';

const importOpmlMock = vi.fn();
const getPoolMock = vi.fn();
const pool = {};
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => getPoolMock(),
}));

vi.mock('../../../../server/services/opmlService', () => ({
  importOpml: (...args: unknown[]) => importOpmlMock(...args),
}));
vi.mock('../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));

const VALID_OPML = '<?xml version="1.0"?><opml version="2.0"><body /></opml>';

describe('/api/opml/import', () => {
  beforeEach(() => {
    getPoolMock.mockReset();
    importOpmlMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
    getPoolMock.mockReturnValue(pool);
  });

  it('returns validation_error when content is empty', async () => {
    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/opml/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      ok: false,
      error: { code: 'validation_error' },
    });
  });

  it('returns the service result in the standard ok envelope', async () => {
    importOpmlMock.mockResolvedValue({
      importedCount: 2,
      duplicateCount: 1,
      invalidCount: 0,
      createdCategoryCount: 1,
      duplicates: [],
      invalidItems: [],
    });

    const mod = await import('./route');
    const res = await mod.POST(
      new Request('http://localhost/api/opml/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: VALID_OPML, fileName: 'feeds.opml' }),
      }),
    );

    expect(res.status).toBe(200);
    expect(importOpmlMock).toHaveBeenCalledWith(pool, {
      content: VALID_OPML,
      fileName: 'feeds.opml',
    });
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ actionKey: 'opml.import' }),
    );
    expect(await res.json()).toMatchObject({
      ok: true,
      data: { importedCount: 2 },
    });
  });
});
