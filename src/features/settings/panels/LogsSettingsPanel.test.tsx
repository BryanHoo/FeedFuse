import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings } from '../settingsSchema';
import type { SettingsDraft } from '../../../store/settingsStore';
import type { SystemLogsPage } from '../../../types';

const getSystemLogsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/apiClient', () => ({
  getSystemLogs: (...args: unknown[]) => getSystemLogsMock(...args),
}));

function createDraft(): SettingsDraft {
  return {
    persisted: JSON.parse(JSON.stringify(defaultPersistedSettings)),
    session: {
      ai: {
        apiKey: '',
        hasApiKey: false,
        clearApiKey: false,
        translationApiKey: '',
        hasTranslationApiKey: false,
        clearTranslationApiKey: false,
      },
      rssValidation: {},
    },
  };
}

function createLogsPage(overrides: Partial<SystemLogsPage> = {}): SystemLogsPage {
  return {
    items: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasPreviousPage: false,
    hasNextPage: false,
    ...overrides,
  };
}

describe('LogsSettingsPanel', () => {
  beforeEach(() => {
    getSystemLogsMock.mockReset();
    vi.useRealTimers();
  });

  it('debounces keyword search and resets to page 1', async () => {
    vi.useFakeTimers();
    getSystemLogsMock.mockResolvedValue(createLogsPage());

    try {
      const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');
      render(
        <LogsSettingsPanel
          draft={createDraft()}
          onChange={() => undefined}
          initialLogsPage={createLogsPage({
            page: 3,
            pageSize: 20,
            total: 60,
            hasPreviousPage: true,
            hasNextPage: false,
          })}
        />,
      );

      const input = screen.getByRole('textbox', { name: '搜索日志' });
      await act(async () => {
        fireEvent.change(input, { target: { value: 'summary' } });
        await vi.advanceTimersByTimeAsync(299);
      });
      expect(getSystemLogsMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });

      expect(getSystemLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: 'summary', page: 1, pageSize: 20 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('expands details inline when clicking a log row', async () => {
    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');

    render(
      <LogsSettingsPanel
        draft={createDraft()}
        onChange={() => undefined}
        initialLogsPage={createLogsPage({
          items: [
            {
              id: '1',
              level: 'error',
              category: 'external_api',
              message: 'AI summary request failed',
              details: '{"error":{"message":"429"}}',
              source: 'aiSummaryStreamWorker',
              context: { status: 429 },
              createdAt: '2026-03-19T10:12:30.000Z',
            },
          ],
          total: 1,
        })}
      />,
    );

    expect(screen.queryByText('{"error":{"message":"429"}}')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /AI summary request failed/i }));

    expect(screen.getByText('{"error":{"message":"429"}}')).toBeInTheDocument();
    expect(screen.getByText(/"status": 429/)).toBeInTheDocument();
  });

  it('shows previous and next pagination instead of load more', async () => {
    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');

    render(
      <LogsSettingsPanel
        draft={createDraft()}
        onChange={() => undefined}
        initialLogsPage={createLogsPage({
          items: [
            {
              id: '1',
              level: 'info',
              category: 'settings',
              message: 'Logging enabled',
              details: null,
              source: 'settings',
              context: {},
              createdAt: '2026-03-19T10:00:00.000Z',
            },
          ],
          total: 25,
          hasNextPage: true,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
  });
});
