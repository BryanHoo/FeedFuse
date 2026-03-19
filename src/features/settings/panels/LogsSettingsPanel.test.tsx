import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings } from '../settingsSchema';
import type { SettingsDraft } from '../../../store/settingsStore';

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

describe('LogsSettingsPanel', () => {
  beforeEach(() => {
    getSystemLogsMock.mockReset();
  });

  it('renders details as plain text instead of HTML', async () => {
    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');

    render(
      <LogsSettingsPanel
        draft={createDraft()}
        onChange={() => undefined}
        initialLogs={[
          {
            id: '1',
            level: 'error',
            category: 'external_api',
            message: 'AI summary request failed',
            details: '<script>alert(1)</script>{"error":{"message":"429"}}',
            source: 'aiSummaryStreamWorker',
            context: { status: 429 },
            createdAt: '2026-03-19T10:12:30.000Z',
          },
        ]}
      />,
    );

    expect(
      screen.getByText('<script>alert(1)</script>{"error":{"message":"429"}}'),
    ).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('refetches logs with level filter and resets the list', async () => {
    getSystemLogsMock
      .mockResolvedValueOnce({
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
        nextCursor: 'cursor-1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: '2',
            level: 'error',
            category: 'external_api',
            message: 'AI summary request failed',
            details: '{"error":{"message":"429"}}',
            source: 'aiSummaryStreamWorker',
            context: { status: 429 },
            createdAt: '2026-03-19T10:05:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');
    render(<LogsSettingsPanel draft={createDraft()} onChange={() => undefined} />);

    expect(await screen.findByText('Logging enabled')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'error' }));

    await waitFor(() => {
      expect(getSystemLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ level: 'error', before: null }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByText('Logging enabled')).not.toBeInTheDocument();
      expect(screen.getByText('AI summary request failed')).toBeInTheDocument();
    });
  });

  it('loads more logs with nextCursor and appends items', async () => {
    getSystemLogsMock
      .mockResolvedValueOnce({
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
        nextCursor: 'cursor-1',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: '2',
            level: 'warning',
            category: 'ai_translate',
            message: 'AI translation segment retry queued',
            details: null,
            source: 'route',
            context: { segmentIndex: 1 },
            createdAt: '2026-03-19T09:59:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');
    render(<LogsSettingsPanel draft={createDraft()} onChange={() => undefined} />);

    expect(await screen.findByText('Logging enabled')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));

    await waitFor(() => {
      expect(getSystemLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ before: 'cursor-1' }),
      );
    });

    expect(screen.getByText('Logging enabled')).toBeInTheDocument();
    expect(await screen.findByText('AI translation segment retry queued')).toBeInTheDocument();
  });

  it('keeps the current level filter when loading more pages', async () => {
    getSystemLogsMock
      .mockResolvedValueOnce({
        items: [
          {
            id: '1',
            level: 'error',
            category: 'external_api',
            message: 'first error',
            details: null,
            source: 'summary',
            context: {},
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
        nextCursor: 'cursor-error',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: '1',
            level: 'error',
            category: 'external_api',
            message: 'first error',
            details: null,
            source: 'summary',
            context: {},
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
        nextCursor: 'cursor-error',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: '2',
            level: 'error',
            category: 'external_api',
            message: 'older error',
            details: null,
            source: 'summary',
            context: {},
            createdAt: '2026-03-19T09:59:00.000Z',
          },
        ],
        nextCursor: null,
        hasMore: false,
      });

    const { default: LogsSettingsPanel } = await import('./LogsSettingsPanel');
    render(<LogsSettingsPanel draft={createDraft()} onChange={() => undefined} />);

    expect(await screen.findByText('first error')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'error' }));
    await waitFor(() => {
      expect(getSystemLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ level: 'error', before: null }),
      );
    });
    fireEvent.click(await screen.findByRole('button', { name: '加载更多' }));

    await waitFor(() => {
      expect(getSystemLogsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ level: 'error', before: 'cursor-error' }),
      );
    });
  });
});
