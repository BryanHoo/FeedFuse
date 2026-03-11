import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import ReaderApp from './ReaderApp';
import { useAppStore } from '../../store/appStore';
import { defaultPersistedSettings } from '../../features/settings/settingsSchema';
import { useSettingsStore } from '../../store/settingsStore';

let documentVisibilityState: DocumentVisibilityState = 'visible';
let snapshotRequests = 0;
let refreshRequests = 0;

function installVisibilityStateGetter() {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => documentVisibilityState,
  });
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function getFetchCallUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

function getFetchCallMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (typeof Request !== 'undefined' && input instanceof Request) return input.method;
  return init?.method ?? 'GET';
}

describe('ReaderApp', () => {
  beforeEach(() => {
    documentVisibilityState = 'visible';
    snapshotRequests = 0;
    refreshRequests = 0;
    installVisibilityStateGetter();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);
        if (url.includes('/api/settings/ai/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings/translation/api-key')) {
          return jsonResponse({ ok: true, data: { hasApiKey: false } });
        }
        if (url.includes('/api/settings')) {
          return jsonResponse({ ok: true, data: structuredClone(defaultPersistedSettings) });
        }
        if (url.includes('/api/reader/snapshot') && method === 'GET') {
          snapshotRequests += 1;
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [],
              articles: { items: [], nextCursor: null },
            },
          });
        }
        if (url.includes('/api/feeds/refresh') || url.includes('/refresh')) {
          refreshRequests += 1;
          return jsonResponse({ ok: true });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders current reader chrome', async () => {
    await act(async () => {
      render(<ReaderApp />);
    });
    expect(screen.getByAltText('FeedFuse')).toBeInTheDocument();
    expect(screen.getByText('文章')).toBeInTheDocument();
    expect(screen.getByLabelText('打开设置')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('打开设置'));
    expect(await screen.findByTestId('settings-center-modal')).toBeInTheDocument();
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

  it('reloads reader snapshot when the page becomes visible again', async () => {
    await act(async () => {
      render(<ReaderApp />);
    });

    expect(snapshotRequests).toBe(1);
    expect(refreshRequests).toBe(0);

    documentVisibilityState = 'hidden';
    fireEvent(document, new Event('visibilitychange'));

    documentVisibilityState = 'visible';
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => {
      expect(snapshotRequests).toBe(2);
    });
    expect(refreshRequests).toBe(0);
  });

  it('limits automatic visible refreshes to once every five minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-09T10:00:00.000Z'));

    await act(async () => {
      render(<ReaderApp />);
    });

    expect(snapshotRequests).toBe(1);

    documentVisibilityState = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    documentVisibilityState = 'visible';
    fireEvent(document, new Event('visibilitychange'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(snapshotRequests).toBe(2);

    documentVisibilityState = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    documentVisibilityState = 'visible';
    fireEvent(document, new Event('visibilitychange'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(snapshotRequests).toBe(2);

    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    documentVisibilityState = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    documentVisibilityState = 'visible';
    fireEvent(document, new Event('visibilitychange'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(snapshotRequests).toBe(3);
  });

  it('registers notification bridge for api client failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);
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
        if (url.includes('/api/feeds') && method === 'POST') {
          return jsonResponse({
            ok: false,
            error: { code: 'conflict', message: '订阅源已存在' },
          });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    await act(async () => {
      render(<ReaderApp />);
    });

    const { createFeed } = await import('../../lib/apiClient');
    await act(async () => {
      await expect(
        createFeed({ title: 'A', url: 'https://example.com/rss.xml' }),
      ).rejects.toMatchObject({ code: 'conflict' });
    });

    expect(await screen.findByText('订阅源已存在')).toBeInTheDocument();
  });

  it('does not apply removed sidebarCollapsed setting from persisted settings', async () => {
    const remoteSettings = structuredClone(defaultPersistedSettings);
    remoteSettings.general.sidebarCollapsed = true;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = getFetchCallUrl(input);
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
