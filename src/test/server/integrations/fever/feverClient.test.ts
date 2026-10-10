import { describe, expect, it, vi } from 'vitest';

describe('feverClient', () => {
  it('posts api payload with fever auth and parses feeds response', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          api_version: 3,
          auth: 1,
          feeds_groups: [{ group_id: '10', feed_ids: '1,2' }],
          feeds: [{ id: '1', title: 'Feed', url: 'https://example.com/feed' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          api_version: 3,
          auth: 1,
          groups: [{ id: '10', title: 'Tech' }],
          feeds_groups: [{ group_id: '10', feed_ids: '1,2' }],
        }),
      });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    const result = await client.listFeeds();

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://reader.example.com?api&feeds=1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://reader.example.com?api&groups=1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }),
    );
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('api_key')).toBe('3610fcbefb84d63611e69521ee5d95fb');
    expect(body.get('feeds')).toBeNull();
    expect(result[0]?.id).toBe('1');
    expect(result[0]?.groupName).toBe('Tech');
  });

  it('passes since_id when listing items', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        items: [{ id: '11', feed_id: '1', title: 'Item', created_on_time: 1779444300 }],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com/',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    const items = await client.listItems('88');

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://reader.example.com?api&items=1&since_id=88');
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('items')).toBeNull();
    expect(body.get('since_id')).toBeNull();
    expect(items[0]?.feedId).toBe('1');
    expect(items[0]?.createdAt).toBe('2026-05-22T10:05:00.000Z');
  });

  it('passes max_id when listing items for full reconciliation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        items: [{ id: '11', feed_id: '1', title: 'Item', created_on_time: 1779444300 }],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com/',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await client.listItems(undefined, '88');

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://reader.example.com?api&items=1&max_id=88');
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('max_id')).toBeNull();
  });

  it('builds mark item payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await client.markItem({ itemId: '42', as: 'saved' });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'https://reader.example.com?api&mark=item&id=42&as=saved',
    );
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('mark')).toBeNull();
    expect(body.get('id')).toBeNull();
    expect(body.get('as')).toBeNull();
  });

  it('keeps explicit fever endpoint paths such as tt-rss index.php', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        feeds: [],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'http://host.docker.internal:18083/tt-rss/plugins.local/fever/index.php',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await client.listItems();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      'http://host.docker.internal:18083/tt-rss/plugins.local/fever/index.php?api&items=1',
    );
  });

  it('maps fetch transport failures to service unavailable errors', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await expect(client.listFeeds()).rejects.toMatchObject({
      status: 503,
      message: 'Fever 服务暂时不可用，请稍后重试',
    });
  });

  it('maps invalid json responses to fever protocol errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await expect(client.listFeeds()).rejects.toMatchObject({
      code: 'fever_protocol_error',
      status: 502,
    });
  });
  it('aborts stalled requests after the configured timeout', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }));
      const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
      const client = createFeverClient({ baseUrl: 'https://example.com', username: 'u', apiKey: 'k', fetchImpl, timeoutMs: 100 });
      const result = expect(client.markItem({ itemId: '1', as: 'read' })).rejects.toMatchObject({ status: 503, message: 'Fever 请求超时，请重试' });
      await vi.advanceTimersByTimeAsync(100);
      await result;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the timeout active while reading the response body', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => Promise.resolve({
        ok: true,
        json: () => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })),
      } as Response));
      const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
      const client = createFeverClient({ baseUrl: 'https://example.com', username: 'u', apiKey: 'k', fetchImpl, timeoutMs: 100 });
      const result = expect(client.markItem({ itemId: '1', as: 'read' })).rejects.toMatchObject({ status: 503 });
      await vi.advanceTimersByTimeAsync(100);
      await result;
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('propagates caller cancellation to the remote request and clears the timeout', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }));
      const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
      const client = createFeverClient({ baseUrl: 'https://example.com', username: 'u', apiKey: 'k', fetchImpl, signal: controller.signal });
      const result = expect(client.markItem({ itemId: '1', as: 'read' })).rejects.toThrow();
      controller.abort();
      await result;
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it('does not accept an HTTP error carrying a successful auth envelope', async () => {
    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({ baseUrl: 'https://example.com', username: 'u', apiKey: 'k', fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ auth: 1, api_version: 3 }) }) });
    await expect(client.markItem({ itemId: '1', as: 'read' })).rejects.toThrow('HTTP 500');
  });

});
