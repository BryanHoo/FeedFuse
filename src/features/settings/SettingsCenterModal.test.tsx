import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultPersistedSettings } from './settingsSchema';
import ReaderLayout from '../reader/ReaderLayout';
import { ToastHost } from '../toast/ToastHost';
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
    <>
      <ReaderLayout />
      <ToastHost />
    </>,
  );
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

async function getFetchCallBodyText(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    try {
      return await input.text();
    } catch {
      return undefined;
    }
  }

  return typeof init?.body === 'string' ? init.body : undefined;
}

describe('SettingsCenterModal', () => {
  let lastSettingsPutBodyText: string | null = null;

  beforeEach(() => {
    let remoteSettings = structuredClone(defaultPersistedSettings);
    let remoteHasApiKey = false;
    let remoteHasTranslationApiKey = false;
    let createdCategoryCount = 0;
    lastSettingsPutBodyText = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

        if (url.includes('/api/categories') && method === 'POST') {
          const bodyText = await getFetchCallBodyText(input, init);
          const body = typeof bodyText === 'string' ? JSON.parse(bodyText) : {};
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
          if (method === 'PUT') {
            const bodyText = await getFetchCallBodyText(input, init);
            const body = typeof bodyText === 'string' ? JSON.parse(bodyText) : {};
            remoteHasApiKey = Boolean(String(body.apiKey ?? '').trim());
            return new Response(JSON.stringify({ ok: true, data: { hasApiKey: remoteHasApiKey } }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }

          if (method === 'DELETE') {
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
          if (method === 'PUT') {
            const bodyText = await getFetchCallBodyText(input, init);
            const body = typeof bodyText === 'string' ? JSON.parse(bodyText) : {};
            remoteHasTranslationApiKey = Boolean(String(body.apiKey ?? '').trim());
            return new Response(
              JSON.stringify({ ok: true, data: { hasApiKey: remoteHasTranslationApiKey } }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            );
          }

          if (method === 'DELETE') {
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

        if (url.includes('/api/opml/import') && method === 'POST') {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                importedCount: 0,
                duplicateCount: 0,
                invalidCount: 0,
                createdCategoryCount: 0,
                duplicates: [],
                invalidItems: [],
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        if (url.includes('/api/opml/export')) {
          return new Response('<?xml version="1.0"?><opml version="2.0"></opml>', {
            status: 200,
            headers: {
              'content-type': 'application/xml; charset=utf-8',
              'content-disposition': 'attachment; filename="feedfuse-subscriptions.opml"',
            },
          });
        }

        if (url.includes('/api/logs')) {
          return new Response(
            JSON.stringify({
              ok: true,
              data: {
                items: [],
                page: 1,
                pageSize: 20,
                total: 0,
                hasPreviousPage: false,
                hasNextPage: false,
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

        if (method === 'PUT') {
          const bodyText = await getFetchCallBodyText(input, init);
          lastSettingsPutBodyText = bodyText ?? null;
          const body = typeof bodyText === 'string' ? JSON.parse(bodyText) : {};
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
    fireEvent.click(screen.getByLabelText('打开设置'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
      expect(screen.getByTestId('settings-center-overlay')).toBeInTheDocument();
      expect(screen.getByLabelText('关闭设置')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: '保存' })).not.toBeInTheDocument();
  });

  it('renders drawer with left nav and right content workspace layout', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('打开设置'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-section-tab-general')).toBeInTheDocument();
    expect(screen.queryByTestId('settings-section-tab-categories')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-section-tab-rss')).toBeInTheDocument();
    expect(screen.getByText('主题')).toBeInTheDocument();
  });

  it('renders logging as the fourth settings section', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('打开设置'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab');
    expect(tabs[3]).toHaveAttribute('data-testid', 'settings-section-tab-logging');
    expect('logs' in (useSettingsStore.getState().draft as Record<string, unknown>)).toBe(false);
  });

  it('does not show removed sidebar-collapsed and rss-fulltext settings items', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('打开设置'));

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
    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument());
  });

  it('closes settings dialog on overlay click', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    const overlay = screen.getByTestId('settings-center-overlay');
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    await waitFor(() => expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument());
  });

  it('asks for confirmation when closing with unresolved validation errors', async () => {
    resetSettingsStore();
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('打开设置'));
    fireEvent.click(await screen.findByTestId('settings-section-tab-ai'));

    const apiBaseUrlInput = await screen.findByLabelText('API 地址');
    fireEvent.change(apiBaseUrlInput, { target: { value: 'not-a-valid-url' } });

    fireEvent.click(screen.getByLabelText('关闭设置'));
    expect(screen.getByText('关闭后会丢失未成功保存的修改')).toBeInTheDocument();
  });

  it('loads draft on open and closes on cancel after autosave', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
      expect(useSettingsStore.getState().draft).not.toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: '深色' }));
    expect(useSettingsStore.getState().draft?.persisted.general.theme).toBe('dark');

    await waitFor(() => {
      expect(screen.getByText('已保存')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('关闭设置'));
    expect(screen.queryByTestId('settings-center-modal')).not.toBeInTheDocument();
    expect(useSettingsStore.getState().draft).toBeNull();

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(useSettingsStore.getState().draft?.persisted.general.theme).toBe('dark');
    });
  });

  it('does not expose ai provider field and does not expose shortcuts tab', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
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

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('settings-section-tab-ai'));

    await waitFor(() => {
      expect(screen.getByLabelText('API 密钥')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'sk-test' } });

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

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('settings-section-tab-categories')).not.toBeInTheDocument();
  });

  it('uses right drawer shell with sidebar tab layout', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    expect(screen.getByTestId('settings-center-overlay')).toBeInTheDocument();
    expect(screen.getByLabelText('设置导航')).toBeInTheDocument();
  });

  it('uses flat controls across settings sections', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
    await screen.findByTestId('settings-center-modal');

    const settingsNav = screen.getByLabelText('设置导航').closest('aside');
    expect(settingsNav?.className).toContain('bg-muted/40');
    expect(settingsNav?.className).toContain('supports-[backdrop-filter]:bg-muted/30');

    const rssTab = screen.getByTestId('settings-section-tab-rss');
    expect(rssTab.className).not.toContain('data-[state=active]:shadow-sm');

    const autoMarkReadButton = screen.getByRole('button', { name: '自动标记' });
    expect(autoMarkReadButton.className).not.toContain('rounded-lg');

    fireEvent.click(rssTab);
    expect((await screen.findByLabelText('全局关键词过滤')).className).not.toContain(
      'shadow-sm',
    );
    const rssIntervalTrigger = screen.getAllByRole('combobox')[0];
    expect(rssIntervalTrigger.className).not.toContain('rounded-lg');

    fireEvent.click(screen.getByTestId('settings-section-tab-ai'));
    expect(
      await screen.findByRole('button', { name: '复用主配置' }),
    ).not.toHaveClass('rounded-lg');
  });


  it('saves global keyword filter from rss settings and refreshes snapshot', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('settings-section-tab-rss'));
    const textarea = await screen.findByLabelText('全局关键词过滤');
    fireEvent.change(textarea, { target: { value: 'Sponsored\n招聘' } });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([input, init]) => {
          const url = getFetchCallUrl(input);
          const method = getFetchCallMethod(input, init);
          return url.includes('/api/settings') && method === 'PUT' && Boolean(lastSettingsPutBodyText?.includes('Sponsored'));
        }),
      ).toBe(true);
    });

    await waitFor(() => {
      const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([input]) => getFetchCallUrl(input).includes('/api/reader/snapshot'))).toBe(true);
    });
  });

  it('imports opml from the RSS tab, shows summary, and reloads snapshot once', async () => {
    resetSettingsStore();
    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('打开设置'));
    fireEvent.click(await screen.findByTestId('settings-section-tab-rss'));

    const countSnapshotCalls = () =>
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) =>
        getFetchCallUrl(input).includes('/api/reader/snapshot'),
      ).length;

    const snapshotCallsBeforeImport = countSnapshotCalls();
    const input = await screen.findByTestId('opml-file-input');
    const file = new File(['<opml version="2.0"><body /></opml>'], 'feeds.opml', {
      type: 'text/xml',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('已导入 0 个订阅')).toBeInTheDocument();
    });
    expect(screen.getByText('OPML 导入完成')).toBeInTheDocument();
    expect(screen.queryAllByText('OPML 导入完成')).toHaveLength(1);

    await waitFor(() => {
      expect(countSnapshotCalls()).toBe(snapshotCallsBeforeImport + 1);
    });
  });

  it('shows one autosave success toast every 30s window through notifier', async () => {
    resetSettingsStore();
    const dateNowSpy = vi.spyOn(Date, 'now');
    dateNowSpy.mockReturnValue(100_000);

    try {
      renderWithNotifications();

      fireEvent.click(screen.getByLabelText('打开设置'));
      await waitFor(() => {
        expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: '深色' }));
      await waitFor(() => {
        expect(lastSettingsPutBodyText).toContain('"theme":"dark"');
      });

      expect(await screen.findByText('设置已自动保存')).toBeInTheDocument();

      dateNowSpy.mockReturnValue(110_000);
      fireEvent.click(screen.getByRole('button', { name: '浅色' }));
      await waitFor(() => {
        expect(lastSettingsPutBodyText).toContain('"theme":"light"');
      });

      expect(screen.queryAllByText('设置已自动保存')).toHaveLength(1);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('exports opml from the RSS tab and shows one success toast', async () => {
    resetSettingsStore();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createObjectURLMock = vi.fn(() => 'blob:feedfuse-opml');
    const revokeObjectURLMock = vi.fn();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    try {
      renderWithNotifications();

      fireEvent.click(screen.getByLabelText('打开设置'));
      fireEvent.click(await screen.findByTestId('settings-section-tab-rss'));
      fireEvent.click(await screen.findByRole('button', { name: '导出 OPML' }));

      expect(await screen.findByText('OPML 已开始下载')).toBeInTheDocument();
      expect(screen.queryAllByText('OPML 已开始下载')).toHaveLength(1);
      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:feedfuse-opml');
    } finally {
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          writable: true,
          value: originalCreateObjectURL,
        });
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          writable: true,
          value: originalRevokeObjectURL,
        });
      }
      clickSpy.mockRestore();
    }
  });

  it('shows backend autosave error through the unified notifier', async () => {
    resetSettingsStore();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getFetchCallUrl(input);
        const method = getFetchCallMethod(input, init);

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

        if (url.includes('/api/settings') && method === 'PUT') {
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

    fireEvent.click(screen.getByLabelText('打开设置'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-center-modal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '深色' }));

    expect(await screen.findByText('保存设置失败：设置保存失败，请稍后重试')).toBeInTheDocument();
    expect(screen.queryByText('设置保存失败，请稍后重试')).not.toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
