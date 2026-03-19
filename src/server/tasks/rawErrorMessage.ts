const MAX_RAW_ERROR_LENGTH = 800;
const REDACTED = '[REDACTED]';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isGenericWrapperMessage(value: string): boolean {
  const normalized = value.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized === 'connection error.' ||
    normalized === 'request timed out.' ||
    normalized === 'request was aborted.' ||
    (/\b(request|provider|openai|api)\b/.test(normalized) && /\b(failed|error)\b/.test(normalized))
  );
}

function extractErrorTextInternal(err: unknown, seen: WeakSet<object>): string | null {
  if (typeof err === 'string') return err;
  if (!isRecord(err)) return null;
  if (seen.has(err)) return null;
  seen.add(err);

  if (err instanceof Error) {
    const nested =
      extractErrorTextInternal((err as Error & { error?: unknown }).error, seen) ??
      extractErrorTextInternal((err as Error & { cause?: unknown }).cause, seen);
    const ownMessage = typeof err.message === 'string' ? err.message.trim() : '';

    if (nested && (!ownMessage || isGenericWrapperMessage(ownMessage))) {
      return nested;
    }
    if (ownMessage) return ownMessage;
    if (nested) return nested;
    if (typeof err.name === 'string' && err.name.trim()) return err.name;
    return null;
  }

  const nested =
    (isRecord(err.error) && typeof err.error.message === 'string' && err.error.message.trim()
      ? err.error.message
      : null) ??
    extractErrorTextInternal(err.error, seen) ??
    extractErrorTextInternal(err.cause, seen) ??
    extractErrorTextInternal(err.details, seen);
  if (nested) return nested;

  const hasStructuredMetadata =
    typeof err.status === 'number' || typeof err.code === 'string' || typeof err.type === 'string';
  if (hasStructuredMetadata && typeof err.message === 'string' && err.message.trim()) {
    return err.message;
  }
  if (hasStructuredMetadata && typeof err.name === 'string' && err.name.trim()) return err.name;
  return null;
}

export function extractErrorText(err: unknown): string | null {
  return extractErrorTextInternal(err, new WeakSet<object>());
}

function redactSecrets(input: string): string {
  return input
    .replace(/Authorization:\s*Bearer\s+[^\s,;]+/gi, `Authorization: Bearer ${REDACTED}`)
    .replace(/Bearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(/(api_key=)[^&\s]+/gi, `$1${REDACTED}`)
    .replace(/\b[A-Za-z0-9_\-.]{24,}\b/g, REDACTED);
}

export function toRawErrorMessage(err: unknown): string | null {
  const extracted = extractErrorText(err);
  if (!extracted) return null;

  const redacted = redactSecrets(extracted);
  const compact = redacted.replace(/\s+/g, ' ').trim();
  if (!compact) return null;

  return compact.slice(0, MAX_RAW_ERROR_LENGTH);
}
