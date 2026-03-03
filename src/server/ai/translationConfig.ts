export interface TranslationConfigInput {
  settings: {
    ai: {
      model: string;
      apiBaseUrl: string;
      translation: {
        useSharedAi: boolean;
        model: string;
        apiBaseUrl: string;
      };
    };
  };
  aiApiKey: string;
  translationApiKey: string;
}

export interface TranslationRuntimeConfig {
  model: string;
  apiBaseUrl: string;
  apiKey: string;
}

function trim(value: string): string {
  return value.trim();
}

export function resolveTranslationConfig(
  input: TranslationConfigInput,
): TranslationRuntimeConfig {
  const useShared = input.settings.ai.translation.useSharedAi;

  if (useShared) {
    return {
      model: trim(input.settings.ai.model),
      apiBaseUrl: trim(input.settings.ai.apiBaseUrl),
      apiKey: trim(input.aiApiKey),
    };
  }

  return {
    model: trim(input.settings.ai.translation.model),
    apiBaseUrl: trim(input.settings.ai.translation.apiBaseUrl),
    apiKey: trim(input.translationApiKey),
  };
}
