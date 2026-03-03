import { describe, expect, it } from 'vitest';
import { normalizePersistedSettings } from './settingsSchema';

describe('settingsSchema normalize', () => {
  it('maps legacy flat settings to general namespace and omits shortcuts settings', () => {
    const normalized = normalizePersistedSettings({
      theme: 'dark',
      fontSize: 'large',
      fontFamily: 'serif',
      lineHeight: 'relaxed',
    });

    expect(normalized.general.theme).toBe('dark');
    expect(normalized.general.fontSize).toBe('large');
    expect(normalized.ai.model).toBe('');
    expect(Object.hasOwn(normalized, 'shortcuts')).toBe(false);
  });

  it('migrates legacy appearance settings to general', () => {
    const normalized = normalizePersistedSettings({ appearance: { theme: 'dark' } });
    expect(normalized.general.theme).toBe('dark');
  });

  it('maps legacy rss source folder to category', () => {
    const normalized = normalizePersistedSettings({
      rss: {
        sources: [
          {
            id: '1',
            name: 'Tech',
            url: 'https://example.com/rss.xml',
            folder: '科技',
            enabled: true,
          },
        ],
      },
    });

    expect(normalized.rss.sources[0].category).toBe('科技');
  });

  it('normalizes categories and maps legacy rss source category/folder names', () => {
    const normalized = normalizePersistedSettings({
      categories: [{ id: 'cat-tech', name: '科技' }],
      rss: {
        sources: [
          { id: '1', name: 'A', url: 'https://example.com/rss.xml', category: '科技', enabled: true },
          { id: '2', name: 'B', url: 'https://example.com/rss2.xml', folder: '设计', enabled: true },
        ],
      },
    });

    expect(normalized.categories.length).toBeGreaterThanOrEqual(2);
    expect(normalized.categories.some((c) => c.name === '科技')).toBe(true);
    expect(normalized.categories.some((c) => c.name === '设计')).toBe(true);
  });

  it('falls back invalid rss.fetchIntervalMinutes to default', () => {
    const normalized = normalizePersistedSettings({ rss: { fetchIntervalMinutes: 999 } });
    expect(normalized.rss.fetchIntervalMinutes).toBe(30);
  });

  it('normalizes ai.translation defaults with shared provider enabled', () => {
    const normalized = normalizePersistedSettings({
      ai: {
        model: 'gpt-4.1-mini',
        apiBaseUrl: 'https://api.example.com/v1',
      },
    });

    const ai = normalized.ai as unknown as {
      translation?: {
        useSharedAi?: boolean;
        model?: string;
        apiBaseUrl?: string;
      };
    };

    expect(ai.translation?.useSharedAi).toBe(true);
    expect(ai.translation?.model).toBe('');
    expect(ai.translation?.apiBaseUrl).toBe('');
  });
});
