import type { Pool, PoolClient } from 'pg';
import type { UserOperationActionKey } from '../../lib/userOperationCatalog';
import {
  formatUserOperationFailureReason,
  getUserOperationCatalogEntry,
  renderUserOperationFailure,
  renderUserOperationStarted,
  renderUserOperationSuccess,
} from '../../lib/userOperationCatalog';
import { writeSystemLog } from './systemLogger';

type Queryable = Pool | PoolClient;

interface WriteUserOperationLogInput {
  actionKey: UserOperationActionKey;
  source: string;
  context?: Record<string, unknown>;
}

interface WriteUserOperationFailedLogInput extends WriteUserOperationLogInput {
  err?: unknown;
  details?: string | null;
}

function resolveCatalog(actionKey: UserOperationActionKey) {
  return getUserOperationCatalogEntry(actionKey);
}

function resolveErrorDetails(input: WriteUserOperationFailedLogInput): string | null {
  if (typeof input.details === 'string' && input.details.trim()) {
    return input.details;
  }

  if (input.err instanceof Error) {
    return input.err.message || null;
  }

  if (typeof input.err === 'string') {
    return input.err.trim() || null;
  }

  return null;
}

function buildBaseContext(
  input: WriteUserOperationLogInput,
): Record<string, unknown> {
  const entry = resolveCatalog(input.actionKey);
  return {
    actionKey: input.actionKey,
    operationMode: entry.mode,
    ...(input.context ?? {}),
  };
}

export async function writeUserOperationStartedLog(
  pool: Queryable,
  input: WriteUserOperationLogInput,
) {
  const entry = resolveCatalog(input.actionKey);
  return writeSystemLog(pool, {
    level: 'info',
    category: entry.category,
    message: renderUserOperationStarted(input.actionKey, input.context),
    source: input.source,
    context: {
      ...buildBaseContext(input),
      operationStage: 'started',
    },
  });
}

export async function writeUserOperationSucceededLog(
  pool: Queryable,
  input: WriteUserOperationLogInput,
) {
  const entry = resolveCatalog(input.actionKey);
  return writeSystemLog(pool, {
    level: 'info',
    category: entry.category,
    message: renderUserOperationSuccess(input.actionKey, input.context),
    source: input.source,
    context: {
      ...buildBaseContext(input),
      operationStage: 'finished',
      operationOutcome: 'success',
    },
  });
}

export async function writeUserOperationFailedLog(
  pool: Queryable,
  input: WriteUserOperationFailedLogInput,
) {
  const entry = resolveCatalog(input.actionKey);
  const reason = formatUserOperationFailureReason(input.err);

  return writeSystemLog(pool, {
    level: 'error',
    category: entry.category,
    message: renderUserOperationFailure(input.actionKey, reason, input.context),
    details: resolveErrorDetails(input),
    source: input.source,
    context: {
      ...buildBaseContext(input),
      operationStage: 'finished',
      operationOutcome: 'error',
    },
  });
}
