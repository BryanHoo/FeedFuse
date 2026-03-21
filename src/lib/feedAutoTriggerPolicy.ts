type ExclusivePhase = 'fetch' | 'open';

export interface FeedAutoTriggerFlags {
  fullTextOnOpenEnabled?: boolean;
  fullTextOnFetchEnabled?: boolean;
  aiSummaryOnOpenEnabled?: boolean;
  aiSummaryOnFetchEnabled?: boolean;
  bodyTranslateOnOpenEnabled?: boolean;
  bodyTranslateOnFetchEnabled?: boolean;
}

function normalizeExclusivePair<
  T extends object,
  TFetchKey extends keyof T,
  TOpenKey extends keyof T,
>(
  input: T,
  fetchKey: TFetchKey,
  openKey: TOpenKey,
  preferredPhase: ExclusivePhase,
): T {
  const next = { ...input };
  const fetchEnabled = input[fetchKey] === true;
  const openEnabled = input[openKey] === true;

  // A true value on either side must clear the opposite side so the pair stays exclusive.
  if (fetchEnabled && openEnabled) {
    next[fetchKey] = (preferredPhase === 'fetch') as T[TFetchKey];
    next[openKey] = (preferredPhase === 'open') as T[TOpenKey];
    return next;
  }

  if (fetchEnabled) {
    next[openKey] = false as T[TOpenKey];
    return next;
  }

  if (openEnabled) {
    next[fetchKey] = false as T[TFetchKey];
  }

  return next;
}

export function normalizeFeedAutoTriggerFlags<T extends FeedAutoTriggerFlags>(
  input: T,
  preferredPhase: ExclusivePhase = 'fetch',
): T {
  let next = normalizeExclusivePair(
    input,
    'fullTextOnFetchEnabled',
    'fullTextOnOpenEnabled',
    preferredPhase,
  );
  next = normalizeExclusivePair(
    next,
    'aiSummaryOnFetchEnabled',
    'aiSummaryOnOpenEnabled',
    preferredPhase,
  );
  next = normalizeExclusivePair(
    next,
    'bodyTranslateOnFetchEnabled',
    'bodyTranslateOnOpenEnabled',
    preferredPhase,
  );

  return next;
}
