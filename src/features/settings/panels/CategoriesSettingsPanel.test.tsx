import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider } from '../../notifications/NotificationProvider';
import { useAppStore } from '../../../store/appStore';
import CategoriesSettingsPanel from './CategoriesSettingsPanel';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CategoriesSettingsPanel', () => {
  function renderWithNotifications() {
    return render(
      <NotificationProvider>
        <CategoriesSettingsPanel />
      </NotificationProvider>,
    );
  }

  beforeEach(() => {
    useAppStore.setState({
      feeds: [],
      categories: [{ id: 'cat-uncategorized', name: '未分类', expanded: true }],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
      sidebarCollapsed: false,
      snapshotLoading: false,
    });

    let createdCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/categories') && method === 'POST') {
          const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          createdCount += 1;
          return jsonResponse({
            ok: true,
            data: {
              id: `00000000-0000-4000-8000-00000000000${createdCount}`,
              name: String(body.name ?? ''),
              position: 0,
            },
          });
        }

        if (url.includes('/api/categories/') && method === 'PATCH') {
          const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          const id = url.split('/api/categories/')[1]?.split('?')[0] ?? '';
          return jsonResponse({
            ok: true,
            data: {
              id,
              name: String(body.name ?? ''),
              position: 0,
            },
          });
        }

        if (url.includes('/api/categories/') && method === 'DELETE') {
          return jsonResponse({ ok: true, data: { deleted: true } });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  it('supports category create/rename/delete via categories API', async () => {
    renderWithNotifications();

    fireEvent.change(screen.getByLabelText('新分类名称'), { target: { value: 'Tech' } });
    fireEvent.click(screen.getByRole('button', { name: '添加分类' }));

    await waitFor(() => {
      expect(useAppStore.getState().categories.some((c) => c.name === 'Tech')).toBe(true);
    });
    expect(screen.getByText('已创建分类')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('分类名称-0'), { target: { value: 'Tech News' } });
    fireEvent.blur(screen.getByLabelText('分类名称-0'));

    await waitFor(() => {
      expect(useAppStore.getState().categories.some((c) => c.name === 'Tech News')).toBe(true);
    });

    fireEvent.click(screen.getByLabelText('删除分类-0'));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));
    await waitFor(() => {
      expect(useAppStore.getState().categories.some((c) => c.name === 'Tech News')).toBe(false);
    });
  });

  it('calls reorder api after drag reorder', async () => {
    useAppStore.setState({
      categories: [
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
      sidebarCollapsed: false,
      snapshotLoading: false,
    });

    renderWithNotifications();

    fireEvent.dragStart(screen.getByLabelText('排序手柄-0'));
    fireEvent.dragEnter(screen.getByLabelText('排序手柄-1'));
    fireEvent.drop(screen.getByLabelText('排序手柄-1'));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/categories/reorder'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  it('clears feed bindings when deleting a category', async () => {
    useAppStore.setState({
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      feeds: [
        {
          id: 'feed-1',
          title: 'Example',
          url: 'https://example.com/rss.xml',
          unreadCount: 0,
          categoryId: 'cat-tech',
          category: '科技',
        },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();

    fireEvent.click(screen.getByLabelText('删除分类-0'));
    fireEvent.click(await screen.findByRole('button', { name: '删除' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds[0].categoryId).toBeNull();
    });
  });
});
