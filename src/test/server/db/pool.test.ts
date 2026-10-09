import { createServer, type Server, type Socket } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/infra/env', () => ({
  getServerEnv: () => ({ DATABASE_URL: process.env.DATABASE_URL }),
}));

let pool: Pool | undefined;
let server: Server | undefined;
const sockets = new Set<Socket>();
const acquiredClients = new Set<PoolClient>();
let startupMessage: Buffer | undefined;

// 只模拟 PostgreSQL 启动握手，之后不响应查询，用真实 pg 驱动验证故障和超时。
async function startDatabase(handshake = true): Promise<string> {
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    let initialized = false;
    socket.on('data', (chunk: Buffer) => {
      if (!handshake || initialized) return;
      pending = Buffer.concat([pending, chunk]);
      if (pending.length < 4 || pending.length < pending.readInt32BE(0)) return;
      startupMessage = pending.subarray(0, pending.readInt32BE(0));
      initialized = true;
      // AuthenticationOk（R）与 ReadyForQuery（Z），不需要真实数据库或凭据。
      socket.write(Buffer.from([82, 0, 0, 0, 8, 0, 0, 0, 0, 90, 0, 0, 0, 5, 73]));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  return `postgres://test:test@127.0.0.1:${address.port}/test?sslmode=disable`;
}

async function getTestPool(handshake = true): Promise<Pool> {
  vi.stubEnv('DATABASE_URL', await startDatabase(handshake));
  const mod = await import('@/server/infra/db/pool');
  pool = mod.getPool();
  pool.on('acquire', (client) => acquiredClients.add(client));
  pool.on('release', (_error, client) => acquiredClients.delete(client));
  return pool;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  startupMessage = undefined;
});

afterEach(async () => {
  // 断言失败时也归还借出的连接，避免 pool.end() 等待未释放的测试连接。
  for (const client of acquiredClients) client.release(true);
  acquiredClients.clear();
  if (pool) await pool.end();
  pool = undefined;
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('db pool', () => {
  it('returns a singleton with bounded connection and query timeouts', async () => {
    const db = await getTestPool();
    const mod = await import('@/server/infra/db/pool');
    expect(db).toBe(mod.getPool());
    expect(db.options.connectionTimeoutMillis).toBe(5_000);
    expect(db.options.statement_timeout).toBe(30_000);
    expect(db.options.query_timeout).toBe(35_000);
  });

  it('handles an idle client error and lets pg remove the broken connection', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await getTestPool();
    const client = await db.connect();
    client.release();
    const error = new Error('injected idle connection failure');

    expect(() => client.emit('error', error)).not.toThrow();
    expect(db.totalCount).toBe(0);
    expect(log).toHaveBeenCalledWith('[db.pool] 空闲连接发生错误', {
      name: error.name, message: error.message, stack: error.stack,
    }, {
      totalCount: 0, idleCount: 0, waitingCount: 0,
    });
  });

  it('rejects a stalled connection after five seconds', async () => {
    const db = await getTestPool(false);
    expect(db.options.connectionTimeoutMillis).toBe(5_000);
    const result = expect(db.connect()).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(db.totalCount).toBe(0);
  });

  it('reports queued requests and removes them when pool waiting times out', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await getTestPool();
    db.options.max = 1;
    await db.connect();
    const result = expect(db.connect()).rejects.toThrow(/timeout/);
    expect(db.waitingCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(log).toHaveBeenCalledWith('[db.pool] 存在等待连接的请求', {
      totalCount: 1, idleCount: 0, waitingCount: 1,
    });
    await vi.advanceTimersByTimeAsync(4_000);
    await result;
    expect(db.waitingCount).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('throttles persistent queue warnings and reports a new backlog after recovery', async () => {
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const db = await getTestPool();
    // 延长本测试的排队时间，让持续积压跨越日志限频窗口。
    db.options.connectionTimeoutMillis = 60_000;
    db.options.max = 1;
    const client = await db.connect();
    const waiting = db.connect();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(log).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log).toHaveBeenCalledTimes(2);

    client.release();
    const nextClient = await waiting;
    await vi.advanceTimersByTimeAsync(1_000);
    const newWaiting = db.connect();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(log).toHaveBeenCalledTimes(3);
    nextClient.release();
    (await newWaiting).release();
  });

  it('sets a server statement deadline and rejects an unresponsive query', async () => {
    const db = await getTestPool();
    const client = await db.connect();
    expect(startupMessage?.toString()).toContain('statement_timeout\u000030000\u0000');
    client.release();
    const result = expect(db.query('SELECT 1')).rejects.toThrow('Query read timeout');
    await vi.advanceTimersByTimeAsync(35_000);
    await result;
    expect(db.totalCount).toBe(0);
  });

  it('stops queue monitoring when the pool ends', async () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const db = await getTestPool();
    const monitor = interval.mock.results[0]?.value;
    expect(monitor).toBeDefined();
    expect(monitor.hasRef()).toBe(false);
    await db.end();
    pool = undefined;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
