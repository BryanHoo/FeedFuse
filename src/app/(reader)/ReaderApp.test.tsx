import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import ReaderApp from './ReaderApp';
import { useAppStore } from '../../store/appStore';
import { defaultPersistedSettings } from '../../features/settings/settingsSchema';
import { useSettingsStore } from '../../store/settingsStore';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ReaderApp', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/settings/ai/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings/translation/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings')) {
          return jsonResponse({ ok: true, data: structuredClone(defaultPersistedSettings) });
        }
        if (url.includes('/api/reader/snapshot')) {
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [],
              articles: { items: [], nextCursor: null },
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders current reader chrome', async () => {
    await act(async () => {
      render(<ReaderApp />);
    });
    expect(screen.getByAltText('FeedFuse')).toBeInTheDocument();
    expect(screen.getByText('文章')).toBeInTheDocument();
    expect(screen.getByLabelText('open-settings')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('open-settings'));
    expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('does not register reader keyboard shortcut handlers', async () => {
    await act(async () => {
      render(<ReaderApp />);
    });
    expect(useAppStore.getState().selectedArticleId).toBeNull();

    fireEvent.keyDown(window, { key: 'j' });

    expect(useAppStore.getState().selectedArticleId).toBeNull();
  });

  it('renders notification viewport under reader app', async () => {
    await act(async () => {
      render(<ReaderApp />);
    });

    expect(screen.getByTestId('notification-viewport')).toBeInTheDocument();
  });

  it('does not apply removed sidebarCollapsed setting from persisted settings', async () => {
    const remoteSettings = structuredClone(defaultPersistedSettings);
    remoteSettings.general.sidebarCollapsed = true;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/api/settings/ai/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings/translation/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings')) {
          return jsonResponse({ ok: true, data: remoteSettings });
        }
        if (url.includes('/api/reader/snapshot')) {
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [],
              articles: { items: [], nextCursor: null },
            },
          });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    useAppStore.setState({ sidebarCollapsed: false });

    await act(async () => {
      render(<ReaderApp />);
    });

    await waitFor(() => {
      expect(useSettingsStore.getState().persistedSettings.general.sidebarCollapsed).toBe(true);
    });
    expect(useAppStore.getState().sidebarCollapsed).toBe(false);
  });
});
