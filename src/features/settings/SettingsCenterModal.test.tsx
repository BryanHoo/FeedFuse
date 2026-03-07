import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings } from './settingsSchema';
import ReaderLayout from '../reader/ReaderLayout';
import { ApiNotificationBridge } from '../notifications/ApiNotificationBridge';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';

function resetSettingsStore() {
  useSettingsStore.setState((state) => ({
    ...state,
    persistedSettings: structuredClone(defaultPersistedSettings),
    sessionSettings: {
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
    draft: null,
    validationErrors: {},
    settings: structuredClone(defaultPersistedSettings.general),
  }));
  window.localStorage.clear();

  useAppStore.setState({
    feeds: [],
    categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
    articles: [],
    selectedView: 'all',
    selectedArticleId: null,
    sidebarCollapsed: false,
    snapshotLoading: false,
  });
}

function renderWithNotifications() {
  return render(
    <NotificationProvider>
      <ApiNotificationBridge />
      <ReaderLayout />
    </NotificationProvider>,
  );
}

describe('SettingsCenterModal', () => {
  beforeEach(() => {
    let remoteSettings = structuredClone(defaultPersistedSettings);
    let remoteHasApiKey = false;
    let remoteHasTranslationApiKey = false;
    let createdCategoryCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/api/categories') && init?.method === 'POST') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
          createdCategoryCount += 1;
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                id: `00000000-0000-4000-8000-00000000000${createdCategoryCount}`,
                name: String(body.name ?? ''),
                position: 0,
              },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url.includes('/api/settings/ai/api-key')) {
          if (init?.method === 'PUT') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
            remoteHasApiKey = Boolean(String(body.apiKey ?? '').trim());
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: remoteHasApiKey } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          if (init?.method === 'DELETE') {
            remoteHasApiKey = false;
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: false } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          return new Response(JSON.stringify({ ok: true, data: { hasApiKey: remoteHasApiKey } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/settings/translation/api-key')) {
          if (init?.method === 'PUT') {
            const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
            remoteHasTranslationApiKey = Boolean(String(body.apiKey ?? '').trim());
            return new Response(
              JSON.stringify({ ok: true, data: { hasApiKey: remoteHasTranslationApiKey } }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          if (init?.method === 'DELETE') {
            remoteHasTranslationApiKey = false;
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: false } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          return new Response(
            JSON.stringify({ ok: true, data: { hasApiKey: remoteHasTranslationApiKey } }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url.includes('/api/reader/snapshot')) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                categories: [],
                feeds: [],
                articles: { items: [], nextCursor: null },
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (!url.includes('/api/settings')) {
          throw new Error(`Unexpected fetch: ${url}`);
        }

        if (init?.method === 'PUT') {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
          remoteSettings = body;
          return new Response(JSON.stringify({ ok: true, data: remoteSettings }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ ok: true, data: remoteSettings }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
  });

  it('renders settings in right drawer layout and removes footer save button', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
      expect(screen.getByTestId('settings-center-overlay')).toBeInTheDocument();
      expect(screen.getByLabelText('close-settings')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
  });

  it('renders drawer with left nav and right content workspace layout', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-section-tab-general')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-tab-categories')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-tab-rss')).toBeInTheDocument();
    expect(screen.getByText('主题')).toBeInTheDocument();
  });

  it('does not show removed sidebar-collapsed and rss-fulltext settings items', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.queryByText('侧边栏默认折叠')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('settings-section-tab-rss'));
    expect(screen.queryByText('全文抓取')).not.toBeInTheDocument();
    expect(screen.queryByText('请在订阅源编辑中逐个设置“打开文章时抓取全文”')).not.toBeInTheDocument();
  });

  it('closes settings dialog on Escape', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument());
  });

  it('closes settings dialog on overlay click', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    const overlay = screen.getByTestId('settings-center-overlay');
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument());
  });

  it('asks for confirmation when closing with unresolved validation errors', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('open-settings'));
    fireEvent.click(await screen.findByTestId('settings-section-tab-ai'));

    const apiBaseUrlInput = await screen.findByLabelText('API Base URL');
    fireEvent.change(apiBaseUrlInput, { target: { value: 'not-a-valid-url' } });

    fireEvent.click(screen.getByLabelText('close-settings'));
    expect(screen.getByText('关闭后会丢失未成功保存的修改')).toBeInTheDocument();
  });

  it('loads draft on open and closes on cancel after autosave', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
      expect(useSettingsStore.getState().draft).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(useSettingsStore.getState().draft?.persisted.general.theme).toBe('dark');

    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('close-settings'));
    expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().draft).toBeNull();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(useSettingsStore.getState().draft?.persisted.general.theme).toBe('dark');
    });
  });

  it('does not expose ai provider field and does not expose shortcuts tab', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('settings-section-tab-ai'));

    expect(screen.queryByLabelText('Provider')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('keeps apiKey out of localStorage after save', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('settings-section-tab-ai'));

    await waitFor(() => {
      expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test' } });

    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeInTheDocument();
    });

    const raw = window.localStorage.getItem('feedfuse-settings') ?? '';
    expect(raw).not.toContain('sk-test');
    expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
  });

  it('does not render categories tab in settings anymore', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('settings-section-tab-categories')).not.toBeInTheDocument();
  });

  it('uses right drawer shell with sidebar tab layout', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-center-overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('settings-sections')).toBeInTheDocument();
  });


  it('saves global keyword filter from rss settings and refreshes snapshot', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('settings-section-tab-rss'));
    const textarea = await screen.findByLabelText('全局文章关键词隐藏');
    fireEvent.change(textarea, { target: { value: 'Sponsored\n招聘' } });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([input, init]) => {
          const url = typeof input === 'string' ? input : input.toString();
          return url.includes('/api/settings') && init?.method === 'PUT' && String(init.body).includes('Sponsored');
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([input]) => String(input).includes('/api/reader/snapshot'))).toBe(true);
    });
  });

  it('shows backend autosave error through global api notification', async () => {
    resetSettingsStore();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();

        if (url.includes('/api/settings/ai/api-key')) {
          return new Response(JSON.stringify({ ok: true, data: { hasApiKey: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/settings/translation/api-key')) {
          return new Response(JSON.stringify({ ok: true, data: { hasApiKey: false } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/settings') && init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              ok: false,
              error: {
                code: 'validation_error',
                message: '设置保存失败，请稍后重试',
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url.includes('/api/settings')) {
          return new Response(JSON.stringify({ ok: true, data: structuredClone(defaultPersistedSettings) }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('open-settings'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '深色' }));

    expect(await screen.findByText('设置保存失败，请稍后重试')).toBeInTheDocument();
    expect(screen.queryByText('设置自动保存失败，请检查后重试')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
