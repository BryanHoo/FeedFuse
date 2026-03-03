import { describe, expect, it } from 'vitest';
import { validateSettingsDraft, type SettingsDraft } from './validateSettingsDraft';
import { defaultPersistedSettings } from './settingsSchema';

describe('validateSettingsDraft', () => {
  it('rejects non-http rss url', () => {
    const draft: SettingsDraft = {
      persisted: {
        ...structuredClone(defaultPersistedSettings),
        rss: {
          sources: [{ id: '1', name: 'A', url: 'ftp://bad', category: null, enabled: true }],
        },
      },
      session: { ai: { apiKey: '' } },
    };

    const result = validateSettingsDraft(draft);

    expect(result.valid).toBe(false);
    expect(result.errors['rss.sources.0.url']).toBeTruthy();
  });

  it('accepts valid rss url without verification gate', () => {
    const draft: SettingsDraft = {
      persisted: {
        ...structuredClone(defaultPersistedSettings),
        rss: {
          sources: [{ id: '1', name: 'A', url: 'https://example.com/success.xml', category: null, enabled: true }],
        },
      },
      session: { ai: { apiKey: '' }, rssValidation: {} },
    };

    const result = validateSettingsDraft(draft);
    expect(result.valid).toBe(true);
    expect(result.errors['rss.sources.0.url']).toBeUndefined();
  });

  it('does not validate categories stored in settings', () => {
    const draft: SettingsDraft = {
      persisted: {
        ...structuredClone(defaultPersistedSettings),
        categories: [
          { id: 'cat-1', name: 'Tech' },
          { id: 'cat-2', name: ' tech ' },
        ],
      },
      session: { ai: { apiKey: '' } },
    };

    const result = validateSettingsDraft(draft);
    expect(result.valid).toBe(true);
    expect(result.errors['categories.1.name']).toBeUndefined();
  });

  it('validates dedicated translation apiBaseUrl when useSharedAi is false', () => {
    const persisted = structuredClone(defaultPersistedSettings) as unknown as {
      ai: Record<string, unknown>;
      rss: SettingsDraft['persisted']['rss'];
      general: SettingsDraft['persisted']['general'];
      categories: SettingsDraft['persisted']['categories'];
    };

    persisted.ai = {
      ...persisted.ai,
      translation: {
        useSharedAi: false,
        model: 'gpt-4.1-mini',
        apiBaseUrl: 'not-a-url',
      },
    };

    const draft = {
      persisted,
      session: { ai: { apiKey: '' } },
    } as unknown as SettingsDraft;

    const result = validateSettingsDraft(draft);
    expect(result.valid).toBe(false);
    expect(result.errors['ai.translation.apiBaseUrl']).toBeTruthy();
  });
});
