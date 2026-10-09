import { readFileSync } from 'node:fs';
import { Client } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  readWorkerHeartbeat,
  removeWorkerHeartbeat,
  writeWorkerHeartbeat,
} from '@/server/infra/health/health';

// 使用真实 PostgreSQL 验证迁移与探测 SQL；临时表及事务避免修改现有运行数据。
describe.skipIf(!process.env.DATABASE_URL)('worker heartbeat migration and queries', () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 1_000,
    statement_timeout: 1_000,
    query_timeout: 2_000,
  });
  beforeAll(async () => { await client.connect(); });
  afterAll(async () => { await client.end(); });
  beforeEach(async () => {
    await client.query('begin');
    const sql = readFileSync('src/server/infra/db/migrations/0038_worker_heartbeats.sql', 'utf8');
    await client.query(sql.replace('create table if not exists', 'create temporary table'));
  });
  afterEach(async () => { await client.query('rollback'); });

  it('detects missing, fresh and stale workers using the database clock', async () => {
    expect((await readWorkerHeartbeat(client)).status).toBe('missing');
    await writeWorkerHeartbeat(client, 'worker-a');
    expect((await readWorkerHeartbeat(client)).status).toBe('ok');
    await client.query("update worker_heartbeats set last_seen_at = clock_timestamp() - interval '61 seconds'");
    expect((await readWorkerHeartbeat(client)).status).toBe('stale');
    await writeWorkerHeartbeat(client, 'worker-a');
    expect((await readWorkerHeartbeat(client)).status).toBe('ok');
    expect((await client.query('select count(*) from worker_heartbeats')).rows[0].count).toBe('1');
  });

  it('keeps overall readiness while detecting a stale individual worker', async () => {
    await writeWorkerHeartbeat(client, 'worker-a');
    await client.query("update worker_heartbeats set last_seen_at = clock_timestamp() - interval '61 seconds'");
    await writeWorkerHeartbeat(client, 'worker-b');
    expect((await readWorkerHeartbeat(client)).status).toBe('ok');
    expect((await readWorkerHeartbeat(client, 'worker-a')).status).toBe('stale');
    await removeWorkerHeartbeat(client, 'worker-a');
    expect((await readWorkerHeartbeat(client, 'worker-a')).status).toBe('missing');
    expect((await readWorkerHeartbeat(client, 'worker-b')).status).toBe('ok');
  });

  it('cleans up abandoned instances without deleting recent heartbeats', async () => {
    await writeWorkerHeartbeat(client, 'worker-a');
    await client.query("update worker_heartbeats set last_seen_at = clock_timestamp() - interval '2 days'");
    await writeWorkerHeartbeat(client, 'worker-b');
    expect((await readWorkerHeartbeat(client, 'worker-a')).status).toBe('missing');
    expect((await readWorkerHeartbeat(client, 'worker-b')).status).toBe('ok');
  });
});
