import type { Pool, PoolClient } from 'pg';
import type { LoggingSettings, SystemLogCategory } from '../../types';
import { normalizePersistedSettings } from '../../features/settings/settingsSchema';
import { getUiSettings } from '../repositories/settingsRepo';
import {
  insertSystemLog,
  type SystemLogLevel,
} from '../repositories/systemLogsRepo';

type Queryable = Pool | PoolClient;

const logLevelWeight: Record<SystemLogLevel, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

function meetsMinimumLevel(minLevel: SystemLogLevel, level: SystemLogLevel) {
  return logLevelWeight[level] >= logLevelWeight[minLevel];
}

export interface WriteSystemLogInput {
  level: SystemLogLevel;
  category: SystemLogCategory;
  message: string;
  details?: string | null;
  source: string;
  context?: Record<string, unknown>;
}

export async function writeSystemLog(
  pool: Queryable,
  input: WriteSystemLogInput,
  options?: { forceWrite?: boolean; loggingOverride?: LoggingSettings },
): Promise<{ written: boolean }> {
  const logging =
    options?.loggingOverride ??
    normalizePersistedSettings(await getUiSettings(pool)).logging;

  if (!logging.enabled && !options?.forceWrite) {
    return { written: false };
  }

  if (!options?.forceWrite && !meetsMinimumLevel(logging.minLevel, input.level)) {
    return { written: false };
  }

  await insertSystemLog(pool, {
    ...input,
    details: input.details ?? null,
    context: input.context ?? {},
  });

  return { written: true };
}
