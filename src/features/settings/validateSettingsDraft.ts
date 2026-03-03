import type { PersistedSettings } from '../../types';

export interface SettingsDraft {
  persisted: PersistedSettings;
  session?: {
    ai?: {
      apiKey?: string;
    };
    rssValidation?: Record<
      string,
      {
        status: 'idle' | 'validating' | 'verified' | 'failed';
        verifiedUrl: string | null;
      }
    >;
  };
}

export interface ValidateSettingsDraftResult {
  valid: boolean;
  errors: Record<string, string>;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!parsed) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function isValidHttpUrl(url: string): boolean {
  if (!isValidUrl(url)) {
    return false;
  }

  const parsed = new URL(url);
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

function validateRss(draft: SettingsDraft, errors: Record<string, string>) {
  const sources = draft.persisted.rss?.sources;
  if (!Array.isArray(sources)) {
    return;
  }

  sources.forEach((source, index) => {
    const nameKey = `rss.sources.${index}.name`;
    const urlKey = `rss.sources.${index}.url`;

    if (!source.name.trim()) {
      errors[nameKey] = 'Name is required.';
    }

    const url = source.url.trim();
    if (!url) {
      errors[urlKey] = 'URL is required.';
      return;
    }

    if (!isValidHttpUrl(url)) {
      errors[urlKey] = 'URL must use http or https.';
      return;
    }

  });
}

function validateAi(draft: SettingsDraft, errors: Record<string, string>) {
  const ai = draft.persisted.ai;
  const apiBaseUrl = ai?.apiBaseUrl;
  if (!apiBaseUrl) {
    // continue; translation config may still need validation
  } else if (!isValidUrl(apiBaseUrl)) {
    errors['ai.apiBaseUrl'] = 'API base URL must be a valid URL.';
  }

  const translation = ai?.translation;
  if (!translation || translation.useSharedAi) {
    return;
  }

  const translationApiBaseUrl = translation.apiBaseUrl.trim();
  if (!translationApiBaseUrl) {
    errors['ai.translation.apiBaseUrl'] =
      'Translation API base URL is required when using dedicated translation settings.';
    return;
  }

  if (!isValidUrl(translationApiBaseUrl)) {
    errors['ai.translation.apiBaseUrl'] = 'Translation API base URL must be a valid URL.';
  }
}

export function validateSettingsDraft(draft: SettingsDraft): ValidateSettingsDraftResult {
  const errors: Record<string, string> = {};

  validateRss(draft, errors);
  validateAi(draft, errors);

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
