import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import ReaderApp from '../../../app/(reader)/ReaderApp';
import { useAppStore } from '../../../store/appStore';
import { defaultPersistedSettings } from '../../../features/settings/settingsSchema';
import { useSettingsStore } from '../../../store/settingsStore';
import { useAuthStore } from '../../../store/authStore';

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
    window.localStorage.clear();
    useAuthStore.getState().clearCurrentUser();
    useSettingsStore.setState({
      persistedSettings: structuredClone(defaultPersistedSettings),
      settings: {
        theme: defaultPersistedSettings.general.theme,
        fontSize: defaultPersistedSettings.general.fontSize,
        fontFamily: defaultPersistedSettings.general.fontFamily,
        lineHeight: defaultPersistedSettings.general.lineHeight,
      },
      draft: null,
      validationErrors: {},
    });
    useAppStore.setState({
      selectedView: 'all',
      selectedArticleId: null,
      showUnreadOnly: false,
      unreadOnlyByView: {},
      snapshotLoading: false,
      articleListInitialLoading: false,
      articleListLoadingMore: false,
      articleListLoadMoreError: false,
      articleListNextCursor: null,
      articleListHasMore: false,
      articleListTotalCount: 0,
      newArticlesAvailable: false,
      newArticlesLoading: false,
    });
    installVisibilityStateGetter();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);
        if (url.includes('/api/auth/me')) {
          return jsonResponse({
            ok: false,
            error: { code: 'unauthorized', message: '请先登录后再继续' },
          });
        }
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

  it('reuses server-provided user data without requesting auth me', async () => {
    await act(async () => {
      render(
        <ReaderApp
          initialCurrentUser={{
            id: '2',
            username: 'member',
            type: 'member',
            role: 'member',
            status: 'active',
            sessionVersion: 1,
          }}
        />,
      );
    });

    await waitFor(() => {
      expect(snapshotRequests).toBe(1);
    });

    const requestedUrls = vi.mocked(fetch).mock.calls.map(([input]) => getFetchCallUrl(input));
    expect(requestedUrls.some((url) => url.includes('/api/auth/me'))).toBe(false);
    expect(useAuthStore.getState().currentUser?.id).toBe('2');
  });

  it('ignores unrelated reader key presses', async () => {
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

  it('keeps per-view unread-only preference when switching feeds in the mounted reader app', async () => {
    const remoteSettings = structuredClone(defaultPersistedSettings);
    remoteSettings.general.defaultUnreadOnlyInAll = true;

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
          return jsonResponse({ ok: true, data: remoteSettings });
        }
        if (url.includes('/api/reader/snapshot') && method === 'GET') {
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [],
              articles: { items: [], nextCursor: null },
            },
          });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    useSettingsStore.setState((state) => ({
      persistedSettings: {
        ...state.persistedSettings,
        general: {
          ...state.persistedSettings.general,
          defaultUnreadOnlyInAll: true,
        },
      },
    }));
    window.localStorage.setItem(
      'feedfuse.reader.unreadOnlyByView.v1:anonymous',
      JSON.stringify({ 'feed-1': false }),
    );
    useAppStore.setState({
      selectedView: 'all',
      showUnreadOnly: true,
      unreadOnlyByView: { 'feed-1': false },
    });

    await act(async () => {
      render(<ReaderApp />);
    });

    act(() => {
      useAppStore.getState().setSelectedView('feed-1');
    });

    await waitFor(() => {
      expect(useAppStore.getState().selectedView).toBe('feed-1');
      expect(useAppStore.getState().showUnreadOnly).toBe(false);
    });
  });

  it('loads the first snapshot after user-scoped reader state is rehydrated', async () => {
    const snapshotUrls: string[] = [];

    window.localStorage.setItem(
      'feedfuse.reader.unreadOnlyByView.v1:2',
      JSON.stringify({ all: false }),
    );
    useAppStore.setState({
      selectedView: 'all',
      showUnreadOnly: true,
      unreadOnlyByView: { all: true },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);
        if (url.includes('/api/auth/me')) {
          return jsonResponse({
            ok: true,
            data: {
              id: '2',
              username: 'member',
              type: 'member',
              role: 'member',
              status: 'active',
              sessionVersion: 1,
            },
          });
        }
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
          snapshotUrls.push(url);
          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: [],
              articles: { items: [], nextCursor: null },
            },
          });
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    await act(async () => {
      render(<ReaderApp />);
    });

    await waitFor(() => {
      expect(snapshotUrls).toHaveLength(1);
    });
    expect(snapshotUrls[0]).not.toContain('unreadOnly=true');
    expect(useAppStore.getState().unreadOnlyByView).toEqual({ all: false });
  });

  it('throttles repeated visibility checks to once per minute', async () => {
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
      await vi.advanceTimersByTimeAsync(60 * 1000);
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

  it('checks for new articles while staying visible and pauses checks when hidden', async () => {
    vi.useFakeTimers();
    await act(async () => { render(<ReaderApp />); });
    expect(snapshotRequests).toBe(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
    expect(snapshotRequests).toBe(2);
    expect(refreshRequests).toBe(0);

    documentVisibilityState = 'hidden';
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 1000); });
    expect(snapshotRequests).toBe(2);

    documentVisibilityState = 'visible';
    await act(async () => { fireEvent(document, new Event('visibilitychange')); });
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

    const { createFeed } = await import('@/lib/api/apiClient');
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
