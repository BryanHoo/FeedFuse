import type { Pool, PoolClient } from 'pg';
import type { SystemLogItem, SystemLogLevel } from '../../types';

export type { SystemLogItem, SystemLogLevel };

export interface SystemLogCursor {
  createdAt: string;
  id: string;
}

type Queryable = Pool | PoolClient;

function normalizeContext(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function insertSystemLog(
  pool: Queryable,
  input: Omit<SystemLogItem, 'id' | 'createdAt'>,
): Promise<void> {
  await pool.query(
    `
      insert into system_logs (
        level,
        category,
        message,
        details,
        source,
        context_json
      )
      values ($1, $2, $3, $4, $5, $6)
    `,
    [
      input.level,
      input.category,
      input.message,
      input.details,
      input.source,
      input.context,
    ],
  );
}

export async function listSystemLogs(
  pool: Queryable,
  input: { level?: SystemLogLevel; before?: SystemLogCursor | null; limit: number },
): Promise<{ items: SystemLogItem[]; hasMore: boolean }> {
  const whereParts: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.level) {
    whereParts.push(`level = $${paramIndex++}`);
    params.push(input.level);
  }

  if (input.before) {
    whereParts.push(`(created_at, id) < ($${paramIndex++}::timestamptz, $${paramIndex++}::bigint)`);
    params.push(input.before.createdAt, input.before.id);
  }

  params.push(input.limit + 1);
  const whereSql = whereParts.length ? `where ${whereParts.join(' and ')}` : '';

  const { rows } = await pool.query<SystemLogItem & { context: unknown }>(
    `
      select
        id::text as id,
        level,
        category,
        message,
        details,
        source,
        context_json as context,
        created_at as "createdAt"
      from system_logs
      ${whereSql}
      order by created_at desc, id desc
      limit $${paramIndex}
    `,
    params,
  );

  const hasMore = rows.length > input.limit;
  const items = rows.slice(0, input.limit).map((row) => ({
    ...row,
    context: normalizeContext(row.context),
  }));

  return { items, hasMore };
}

export async function deleteExpiredSystemLogs(
  pool: Queryable,
  input: { retentionDays: number },
): Promise<number> {
  const result = await pool.query(
    `
      delete from system_logs
      where created_at < now() - make_interval(days => $1)
    `,
    [input.retentionDays],
  );

  return result.rowCount ?? 0;
}
