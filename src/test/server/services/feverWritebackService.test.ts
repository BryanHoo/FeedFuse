import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/server/infra/http/errors';

const getFeverItemMappingByLocalArticleIdMock = vi.hoisted(() => vi.fn());
const getFeverAccountByIdMock = vi.hoisted(() => vi.fn());
const createFeverClientMock = vi.hoisted(() => vi.fn());
const setArticleReadMock = vi.hoisted(() => vi.fn());
const setArticleStarredMock = vi.hoisted(() => vi.fn());
const hasAnyFeverItemMappingByLocalArticleIdMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/fever/repositories/feverMappingsRepo', () => ({
  getFeverItemMappingByLocalArticleId: (...args: unknown[]) =>
    getFeverItemMappingByLocalArticleIdMock(...args),
  hasAnyFeverItemMappingByLocalArticleId: (...args: unknown[]) =>
    hasAnyFeverItemMappingByLocalArticleIdMock(...args),
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  getFeverAccountById: (...args: unknown[]) => getFeverAccountByIdMock(...args),
}));

vi.mock('@/server/integrations/fever/feverClient', () => ({
  createFeverClient: (...args: unknown[]) => createFeverClientMock(...args),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
}));

describe('feverWritebackService', () => {
  beforeEach(() => {
    getFeverItemMappingByLocalArticleIdMock.mockReset();
    getFeverAccountByIdMock.mockReset();
    createFeverClientMock.mockReset();
    setArticleReadMock.mockReset();
    setArticleStarredMock.mockReset();
    hasAnyFeverItemMappingByLocalArticleIdMock.mockReset();
  });

  it('writes fever read state remotely before committing local update', async () => {
    const markItemMock = vi.fn().mockResolvedValue(undefined);
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue({
      feverAccountId: '10',
      feverItemId: 'remote-1',
    });
    getFeverAccountByIdMock.mockResolvedValue({
      id: '10',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    createFeverClientMock.mockReturnValue({ markItem: markItemMock });

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');
    const pool = {} as never;

    await updateArticleStateWithWriteback(pool, {
      articleId: '1',
      isRead: true,
    });

    expect(markItemMock).toHaveBeenCalledWith({
      itemId: 'remote-1',
      as: 'read',
    });
    expect(setArticleReadMock).toHaveBeenCalledWith(pool, '1', true, '1');
  });

  it('does not commit local state when fever writeback fails', async () => {
    const markItemMock = vi.fn().mockRejectedValueOnce(new Error('boom'));
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue({
      feverAccountId: '10',
      feverItemId: 'remote-1',
    });
    getFeverAccountByIdMock.mockResolvedValue({
      id: '10',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    createFeverClientMock.mockReturnValue({ markItem: markItemMock });

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');

    await expect(
      updateArticleStateWithWriteback({} as never, { articleId: '1', isStarred: true }),
    ).rejects.toThrow('boom');

    expect(setArticleStarredMock).not.toHaveBeenCalled();
  });

  it('treats articles without active fever mapping as local-only updates', async () => {
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue(null);

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');
    const pool = {} as never;

    await updateArticleStateWithWriteback(pool, {
      articleId: '1',
      isRead: true,
      isStarred: false,
    });

    expect(createFeverClientMock).not.toHaveBeenCalled();
    expect(setArticleReadMock).toHaveBeenCalledWith(pool, '1', true, '1');
    expect(setArticleStarredMock).toHaveBeenCalledWith(pool, '1', false, '1');
  });

  it('rejects writeback updates when a fever article loses its active mapping', async () => {
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue(null);
    hasAnyFeverItemMappingByLocalArticleIdMock.mockResolvedValue(true);

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');

    await expect(
      updateArticleStateWithWriteback({} as never, {
        articleId: '1',
        isRead: true,
        requireRemoteWriteback: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(setArticleReadMock).not.toHaveBeenCalled();
    expect(setArticleStarredMock).not.toHaveBeenCalled();
  });

});
