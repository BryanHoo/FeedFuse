import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchImageStream } from '@/server/infra/http/externalHttpClient';
import { externalHttpTransport } from '@/server/infra/http/externalHttpTransport';

describe('image upstream failure diagnostics', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'custom');
    vi.stubEnv('RSS_ALLOWED_CIDRS', '127.0.0.1/32');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    server = createServer((req, res) => {
      if (req.url?.startsWith('/reset')) { req.socket.destroy(); return; }
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      res.flushHeaders();
      if (req.url === '/ok') { res.end(Buffer.from([0xff, 0xd8, 0xff])); return; }
      if (req.url?.startsWith('/cut')) {
        res.write(Buffer.from([0xff, 0xd8, 0xff]));
        setTimeout(() => res.destroy(), 20);
      }
      // /stall 只发响应头，模拟传输中断后迟迟没有后续数据。
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.unstubAllEnvs();
  });

  it('records connection resets before response headers without leaking URL tokens', async () => {
    const result = await fetchImageStream(`${baseUrl}/reset?token=private-token`, {
      maxRedirects: 3, userAgent: 'test-agent', timeoutMs: 500,
    });
    expect(result).toEqual({ kind: 'bad_gateway' });
    expect(console.warn).toHaveBeenCalledWith('[media.image.fetch_failed]', expect.objectContaining({
      source: `${baseUrl}/reset`, phase: 'headers', code: 'ECONNRESET', timedOut: false,
      durationMs: expect.any(Number),
    }));
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('private-token');
  });

  it('records every failed IPv4 and IPv6 attempt from a combined connection error', async () => {
    const cause = new AggregateError([
      Object.assign(new Error('connect timed out'), { code: 'ETIMEDOUT', address: '1.1.1.1', port: 443 }),
      Object.assign(new Error('network unreachable'), { code: 'ENETUNREACH', address: '2606:4700::1111', port: 443 }),
    ]);
    const error = Object.assign(new Error('Connection failed', { cause }), { code: 'ETIMEDOUT' });
    vi.spyOn(externalHttpTransport, 'stream').mockImplementationOnce(() => { throw error; });

    await expect(fetchImageStream(`${baseUrl}/reset?token=private-token`, {
      maxRedirects: 3, userAgent: 'test-agent', timeoutMs: 500,
    })).resolves.toEqual({ kind: 'bad_gateway' });
    expect(console.warn).toHaveBeenCalledWith('[media.image.fetch_failed]', expect.objectContaining({
      connectionAttempts: [
        { code: 'ETIMEDOUT', address: '1.1.1.1', port: 443 },
        { code: 'ENETUNREACH', address: '2606:4700::1111', port: 443 },
      ],
    }));
  });

  it('records stream failures after headers instead of losing their cause', async () => {
    const result = await fetchImageStream(`${baseUrl}/cut`, {
      maxRedirects: 3, userAgent: 'test-agent', timeoutMs: 500,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected response headers');
    await expect(new Response(result.body).arrayBuffer()).rejects.toThrow();
    expect(console.warn).toHaveBeenCalledWith('[media.image.fetch_failed]', expect.objectContaining({
      source: `${baseUrl}/cut`, phase: 'body', timedOut: false,
    }));
  });

  it('distinguishes a body timeout from a connection reset', async () => {
    const result = await fetchImageStream(`${baseUrl}/stall`, {
      maxRedirects: 3, userAgent: 'test-agent', timeoutMs: 50,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('Expected response headers');
    await expect(new Response(result.body).arrayBuffer()).rejects.toThrow();
    expect(console.warn).toHaveBeenCalledWith('[media.image.fetch_failed]', expect.objectContaining({
      phase: 'body', timedOut: true,
    }));
  });

  it('does not abort a successfully downloaded image after its timeout expires', async () => {
    const result = await fetchImageStream(`${baseUrl}/ok`, {
      maxRedirects: 3, userAgent: 'test-agent', timeoutMs: 500,
    });
    if (result.kind !== 'ok') throw new Error('Expected a successful image response');
    expect((await new Response(result.body).arrayBuffer()).byteLength).toBe(3);
    await new Promise((resolve) => setTimeout(resolve, 550));

    expect(console.warn).not.toHaveBeenCalled();
  });
});
