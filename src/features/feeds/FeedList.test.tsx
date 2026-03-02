import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReaderLayout from '../reader/ReaderLayout';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { useAppStore } from '../../store/appStore';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FeedList manage', () => {
  let lastPatchBody: Record<string, unknown> | null = null;

  function renderWithNotifications() {
    return render(
      <NotificationProvider>
        <ReaderLayout />
      </NotificationProvider>,
    );
  }

  beforeEach(() => {
    lastPatchBody = null;
    useAppStore.setState({
      feeds: [
        {
          id: 'feed-1',
          title: 'My Feed',
          url: 'https://example.com/rss.xml',
          unreadCount: 2,
          enabled: true,
          fullTextOnOpenEnabled: false,
          aiSummaryOnOpenEnabled: false,
          categoryId: null,
          category: null,
        },
      ],
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      articles: [
        {
          id: 'a-1',
          feedId: 'feed-1',
          title: 'A',
          content: '',
          summary: '',
          publishedAt: '',
          link: '',
          isRead: true,
          isStarred: false,
        },
      ],
      selectedView: 'feed-1',
      selectedArticleId: 'a-1',
      sidebarCollapsed: false,
      snapshotLoading: false,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
          const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          lastPatchBody = body;

          let iconUrl: string | null = null;
          if (typeof body.siteUrl === 'string') {
            try {
              const { origin } = new URL(body.siteUrl);
              iconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(origin)}`;
            } catch {
              iconUrl = null;
            }
          }

          return jsonResponse({
            ok: true,
            data: {
              id: 'feed-1',
              title: String(body.title ?? 'My Feed'),
              url: String(body.url ?? 'https://example.com/rss.xml'),
              siteUrl: (body.siteUrl as string | null | undefined) ?? null,
              iconUrl,
              enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
              fullTextOnOpenEnabled: typeof body.fullTextOnOpenEnabled === 'boolean' ? body.fullTextOnOpenEnabled : false,
              aiSummaryOnOpenEnabled:
                typeof body.aiSummaryOnOpenEnabled === 'boolean' ? body.aiSummaryOnOpenEnabled : false,
              categoryId: body.categoryId ?? null,
              fetchIntervalMinutes: 30,
            },
          });
        }

        if (url.includes('/api/rss/validate') && method === 'GET') {
          const feedUrl = new URL(url).searchParams.get('url') ?? '';
          if (feedUrl.includes('changed.example.com')) {
            return jsonResponse({
              ok: true,
              kind: 'rss',
              title: 'Validated Feed Title',
              siteUrl: 'https://changed.example.com/',
            });
          }
          return jsonResponse({
            ok: true,
            kind: 'rss',
            title: 'My Feed',
            siteUrl: 'https://example.com/',
          });
        }

        if (url.includes('/api/feeds/feed-1') && method === 'DELETE') {
          return jsonResponse({ ok: true, data: { deleted: true } });
        }

        if (url.includes('/api/articles/a-1/ai-summary') && method === 'POST') {
          return jsonResponse({
            ok: true,
            data: { enqueued: false, reason: 'missing_api_key' },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opens context menu and edits title', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed Updated' } });
    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /My Feed Updated.*2/ })).toBeInTheDocument();
    });

    expect(screen.getByText('保存成功')).toBeInTheDocument();
  });

  it('uses same form fields as add flow and pre-fills existing values in edit flow', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    expect(screen.getByLabelText('名称')).toHaveValue('My Feed');
    expect(screen.getByLabelText('URL')).toHaveValue('https://example.com/rss.xml');
    expect(screen.getByRole('combobox', { name: '分类' })).toHaveTextContent('未分类');
    expect(screen.queryByRole('combobox', { name: '状态' })).not.toBeInTheDocument();
  });

  it('renders feed icon from persisted icon url instead of feed url derived value', () => {
    useAppStore.setState((state) => ({
      feeds: state.feeds.map((feed) =>
        feed.id === 'feed-1'
          ? {
              ...feed,
              url: 'https://rss-proxy.example.com/feed.xml',
              icon: 'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Forigin.example.com',
            }
          : feed,
      ),
    }));

    renderWithNotifications();

    const feedButton = screen.getByRole('button', { name: /My Feed.*2/ });
    const iconImg = feedButton.querySelector('img[aria-hidden="true"]') as HTMLImageElement | null;
    expect(iconImg).toBeTruthy();
    expect(iconImg?.getAttribute('src')).toBe(
      'https://www.google.com/s2/favicons?sz=64&domain_url=https%3A%2F%2Forigin.example.com',
    );
  });

  it('updates fullTextOnOpenEnabled via edit dialog', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const fulltextCombobox = screen.getByRole('combobox', { name: '打开文章时抓取全文' });
    fireEvent.click(fulltextCombobox);
    fireEvent.click(await screen.findByRole('option', { name: '开启' }));

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].fullTextOnOpenEnabled).toBe(true);
    });
  });

  it('updates aiSummaryOnOpenEnabled via edit dialog', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const aiSummaryCombobox = screen.getByRole('combobox', { name: '打开文章时自动生成 AI 摘要' });
    fireEvent.click(aiSummaryCombobox);
    fireEvent.click(await screen.findByRole('option', { name: '开启' }));

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].aiSummaryOnOpenEnabled).toBe(true);
    });
  });

  it('disables save after edit url until validation succeeds', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const saveButton = screen.getByRole('button', { name: '保存' });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, {
      target: { value: 'https://changed.example.com/rss.xml' },
    });

    expect(saveButton).toBeDisabled();

    fireEvent.blur(urlInput);
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
  });

  it('overwrites title on url validation success in edit flow', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '编辑' }));
    expect(screen.getByRole('dialog', { name: '编辑 RSS 源' })).toBeInTheDocument();

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(titleInput, { target: { value: 'Custom Title' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://changed.example.com/rss.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Validated Feed Title');
    });

    fireEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].title).toBe('Validated Feed Title');
      expect(useAppStore.getState().feeds[0].url).toBe('https://changed.example.com/rss.xml');
    });

    expect(lastPatchBody?.url).toBe('https://changed.example.com/rss.xml');
    expect(lastPatchBody?.siteUrl).toBe('https://changed.example.com/');
  });

  it('toggles enabled via context menu', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '停用' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].enabled).toBe(false);
    });

    expect(screen.getByText('已停用订阅源')).toBeInTheDocument();
  });

  it('deletes feed and falls back selectedView to all', async () => {
    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '删除' }));

    fireEvent.click(screen.getByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(screen.queryByText('My Feed')).not.toBeInTheDocument();
      expect(useAppStore.getState().selectedView).toBe('all');
      expect(useAppStore.getState().selectedArticleId).toBeNull();
    });

    expect(screen.getByText('已删除订阅源')).toBeInTheDocument();
  });

  it('shows error notification when toggle enabled fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/feeds/feed-1') && method === 'PATCH') {
          return jsonResponse({
            ok: false,
            error: {
              code: 'validation_error',
              message: 'invalid feed patch',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    renderWithNotifications();

    fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '停用' }));

    await waitFor(() => {
      expect(screen.getByText(/操作失败/)).toBeInTheDocument();
    });
  });
});
