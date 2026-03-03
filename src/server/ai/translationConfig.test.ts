import { describe, expect, it } from 'vitest';
import { resolveTranslationConfig } from './translationConfig';

describe('resolveTranslationConfig', () => {
  it('uses shared AI settings when translation.useSharedAi = true', () => {
    const result = resolveTranslationConfig({
      settings: {
        ai: {
          model: 'shared-model',
          apiBaseUrl: 'https://shared.example.com/v1',
          translation: {
            useSharedAi: true,
            model: 'dedicated-model',
            apiBaseUrl: 'https://dedicated.example.com/v1',
          },
        },
      },
      aiApiKey: 'shared-key',
      translationApiKey: 'dedicated-key',
    });

    expect(result).toEqual({
      model: 'shared-model',
      apiBaseUrl: 'https://shared.example.com/v1',
      apiKey: 'shared-key',
    });
  });

  it('uses dedicated translation settings when translation.useSharedAi = false', () => {
    const result = resolveTranslationConfig({
      settings: {
        ai: {
          model: 'shared-model',
          apiBaseUrl: 'https://shared.example.com/v1',
          translation: {
            useSharedAi: false,
            model: 'dedicated-model',
            apiBaseUrl: 'https://dedicated.example.com/v1',
          },
        },
      },
      aiApiKey: 'shared-key',
      translationApiKey: 'dedicated-key',
    });

    expect(result).toEqual({
      model: 'dedicated-model',
      apiBaseUrl: 'https://dedicated.example.com/v1',
      apiKey: 'dedicated-key',
    });
  });
});
