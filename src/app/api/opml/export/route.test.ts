import { beforeEach, describe, expect, it, vi } from 'vitest';

const exportOpmlMock = vi.fn();
const getPoolMock = vi.fn();
const pool = {};
const writeUserOperationSucceededLogMock = vi.fn();
const writeUserOperationFailedLogMock = vi.fn();

vi.mock('../../../../server/db/pool', () => ({
  getPool: () => getPoolMock(),
}));

vi.mock('../../../../server/services/opmlService', () => ({
  exportOpml: (...args: unknown[]) => exportOpmlMock(...args),
}));
vi.mock('../../../../server/logging/userOperationLogger', () => ({
  writeUserOperationSucceededLog: (...args: unknown[]) =>
    writeUserOperationSucceededLogMock(...args),
  writeUserOperationFailedLog: (...args: unknown[]) =>
    writeUserOperationFailedLogMock(...args),
}));

describe('/api/opml/export', () => {
  beforeEach(() => {
    getPoolMock.mockReset();
    exportOpmlMock.mockReset();
    writeUserOperationSucceededLogMock.mockReset();
    writeUserOperationFailedLogMock.mockReset();
    getPoolMock.mockReturnValue(pool);
  });

  it('returns xml with content-disposition attachment headers', async () => {
    exportOpmlMock.mockResolvedValue({
      xml: '<?xml version="1.0"?><opml version="2.0"></opml>',
      fileName: 'feedfuse-subscriptions.opml',
    });

    const mod = await import('./route');
    const res = await mod.GET();

    expect(exportOpmlMock).toHaveBeenCalledWith(pool);
    expect(writeUserOperationSucceededLogMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ actionKey: 'opml.export' }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/xml');
    expect(res.headers.get('content-disposition')).toContain(
      'attachment; filename="feedfuse-subscriptions.opml"',
    );
    expect(await res.text()).toContain('<opml version="2.0">');
  });
});
