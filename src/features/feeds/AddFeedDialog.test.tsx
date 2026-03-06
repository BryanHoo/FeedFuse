import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import ReaderLayout from '../reader/ReaderLayout';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { useAppStore } from '../../store/appStore';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

vi.mock('./services/rssValidationService', () => ({
  validateRssUrl: vi.fn(async (url: string) => {
    if (url.includes('success')) {
      return {
        ok: true,
        kind: 'rss' as const,
        title: 'Mock Feed Title',
        siteUrl: 'https://example.com/',
      };
    }
    return { ok: false, errorCode: 'not_feed' as const };
  }),
}));

describe('AddFeedDialog', () => {
  let nextFeedId = 1;
  let lastCreateFeedBody: Record<string, unknown> | null = null;
  let createdFeedById: Map<
    string,
    {
      title: string;
      url: string;
      categoryId: string | null;
      fullTextOnOpenEnabled: boolean;
      aiSummaryOnOpenEnabled: boolean;
      aiSummaryOnFetchEnabled: boolean;
      bodyTranslateOnFetchEnabled: boolean;
      bodyTranslateOnOpenEnabled: boolean;
    }
  >;

  beforeEach(() => {
    nextFeedId = 1;
    lastCreateFeedBody = null;
    createdFeedById = new Map();
    useAppStore.setState({
      feeds: [],
      categories: [
        { id: 'cat-tech', name: '科技', expanded: true },
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
      ],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/feeds/') && url.endsWith('/refresh') && method === 'POST') {
          return jsonResponse({ ok: true, data: { enqueued: true, jobId: 'job-1' } });
        }

        if (url.includes('/api/feeds') && method === 'POST') {
          const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
          lastCreateFeedBody = body;
          const id = `feed-${nextFeedId++}`;
          createdFeedById.set(id, {
            title: String(body.title ?? ''),
            url: String(body.url ?? ''),
            categoryId: (body.categoryId as string | null | undefined) ?? null,
            fullTextOnOpenEnabled: Boolean(body.fullTextOnOpenEnabled ?? false),
            aiSummaryOnOpenEnabled: Boolean(body.aiSummaryOnOpenEnabled ?? false),
            aiSummaryOnFetchEnabled: Boolean(body.aiSummaryOnFetchEnabled ?? false),
            bodyTranslateOnFetchEnabled: Boolean(body.bodyTranslateOnFetchEnabled ?? false),
            bodyTranslateOnOpenEnabled: Boolean(body.bodyTranslateOnOpenEnabled ?? false),
          });
          return jsonResponse({
            ok: true,
            data: {
              id,
              title: String(body.title ?? ''),
              url: String(body.url ?? ''),
              siteUrl: null,
              iconUrl: null,
              enabled: true,
              fullTextOnOpenEnabled: Boolean(body.fullTextOnOpenEnabled ?? false),
              aiSummaryOnOpenEnabled: Boolean(body.aiSummaryOnOpenEnabled ?? false),
              aiSummaryOnFetchEnabled: Boolean(body.aiSummaryOnFetchEnabled ?? false),
              bodyTranslateOnFetchEnabled: Boolean(body.bodyTranslateOnFetchEnabled ?? false),
              bodyTranslateOnOpenEnabled: Boolean(body.bodyTranslateOnOpenEnabled ?? false),
              categoryId: body.categoryId ?? null,
              fetchIntervalMinutes: 30,
              unreadCount: 0,
            },
          });
        }

        if (url.includes('/api/reader/snapshot') && method === 'GET') {
          const view = new URL(url).searchParams.get('view') ?? 'all';
          const isFeedView = view.startsWith('feed-');
          const createdFeed = createdFeedById.get(view);

          return jsonResponse({
            ok: true,
            data: {
              categories: [],
              feeds: isFeedView
                ? [
                    {
                      id: view,
                      title: createdFeed?.title ?? 'Mock Feed',
                      url: createdFeed?.url ?? 'https://example.com/feed.xml',
                      siteUrl: null,
                      iconUrl: null,
                      enabled: true,
                      fullTextOnOpenEnabled: createdFeed?.fullTextOnOpenEnabled ?? false,
                      aiSummaryOnOpenEnabled: createdFeed?.aiSummaryOnOpenEnabled ?? false,
                      aiSummaryOnFetchEnabled: createdFeed?.aiSummaryOnFetchEnabled ?? false,
                      bodyTranslateOnFetchEnabled: createdFeed?.bodyTranslateOnFetchEnabled ?? false,
                      bodyTranslateOnOpenEnabled: createdFeed?.bodyTranslateOnOpenEnabled ?? false,
                      categoryId: createdFeed?.categoryId ?? null,
                      fetchIntervalMinutes: 30,
                      unreadCount: 1,
                    },
                  ]
                : [],
              articles: {
                items: isFeedView
                  ? [
                      {
                        id: `art-${view}`,
                        feedId: view,
                        title: 'Mock Article',
                        summary: 'Summary',
                        author: null,
                        publishedAt: '2026-02-25T00:00:00.000Z',
                        link: 'https://example.com/article',
                        isRead: false,
                        isStarred: false,
                      },
                    ]
                  : [],
                nextCursor: null,
              },
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderWithNotifications() {
    return render(
      <NotificationProvider>
        <ReaderLayout />
      </NotificationProvider>,
    );
  }

  it('opens and closes add feed dialog', () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));
    expect(screen.getByRole('dialog', { name: '添加 RSS 源' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
  });

  it('disables submit until title and url are filled', () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));
    expect(screen.getByRole('button', { name: '添加' })).toBeDisabled();
  });

  it('autofocuses url input on open', () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    const urlInput = screen.getByLabelText('URL');
    expect(urlInput).toHaveFocus();
  });

  it('add dialog only shows URL 名称 分类 fields', () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByLabelText('名称')).toBeInTheDocument();
    expect(screen.getByLabelText('分类')).toBeInTheDocument();

    expect(screen.queryByRole('combobox', { name: '打开文章时抓取全文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '获取文章后自动获取摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章自动获取摘要' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '列表标题自动翻译' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '获取文章后自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '打开文章自动翻译正文' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: '正文翻译' })).not.toBeInTheDocument();
  });

  it('auto fills title when validation succeeds and title is empty', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Mock Feed Title');
    });
  });

  it('overwrites title when validation succeeds even if title already has value', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    const titleInput = screen.getByLabelText('名称');
    const urlInput = screen.getByLabelText('URL');

    fireEvent.change(titleInput, { target: { value: 'Custom Title' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(titleInput).toHaveValue('Mock Feed Title');
    });
  });

  it('submits add feed dialog and closes after valid input', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toBeTruthy();
    expect(lastCreateFeedBody).not.toHaveProperty('fullTextOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('aiSummaryOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('aiSummaryOnFetchEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateOnFetchEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateOnOpenEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('titleTranslateEnabled');
    expect(lastCreateFeedBody).not.toHaveProperty('bodyTranslateEnabled');
  });

  it('submits validated siteUrl in create payload', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toBeTruthy();
    expect(lastCreateFeedBody?.siteUrl).toBe('https://example.com/');
  });

  it('submit add feed payload excludes policy flags', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'Base Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加 RSS 源' })).not.toBeInTheDocument();
    });

    expect(lastCreateFeedBody).toEqual({
      title: 'Mock Feed Title',
      url: 'https://example.com/success.xml',
      siteUrl: 'https://example.com/',
      categoryId: 'cat-tech',
    });
  });

  it('requires successful validation before save', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });

    const submitButton = screen.getByRole('button', { name: '添加' });
    expect(submitButton).toBeDisabled();

    fireEvent.blur(urlInput);
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/changed.xml' },
    });
    expect(submitButton).toBeDisabled();
  });

  it('submits selected categoryId from category dropdown', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'Category Id Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    const categoryInput = screen.getByLabelText('分类');
    fireEvent.focus(categoryInput);
    fireEvent.click(categoryInput);
    expect(await screen.findByRole('listbox', { name: '分类建议' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: '设计' }));
    expect(categoryInput).toHaveValue('设计');
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    const feedCountBefore = useAppStore.getState().feeds.length;
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(useAppStore.getState().feeds.length).toBe(feedCountBefore + 1);
    });

    const added = useAppStore
      .getState()
      .feeds.find((item) => item.url === 'https://example.com/success.xml');
    expect(added?.categoryId).toBe('cat-design');
  });

  it('submits categoryName when user enters a new category', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByLabelText('分类'), {
      target: { value: '新分类' },
    });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(lastCreateFeedBody).toMatchObject({ categoryName: '新分类' });
      expect(lastCreateFeedBody?.categoryId).toBeUndefined();
    });
  });

  it('reuses existing categoryId when input only differs by spaces', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByLabelText('分类'), {
      target: { value: '  科技  ' },
    });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'My Feed' } });
    const urlInput = screen.getByLabelText('URL');
    fireEvent.change(urlInput, { target: { value: 'https://example.com/success.xml' } });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(lastCreateFeedBody).toMatchObject({ categoryId: 'cat-tech' });
      expect(lastCreateFeedBody?.categoryName).toBeUndefined();
    });
  });

  it('keeps category option order in add feed dialog after entry migration', async () => {
    useAppStore.setState({
      categories: [
        { id: 'cat-uncategorized', name: '未分类', expanded: true },
        { id: 'cat-design', name: '设计', expanded: true },
        { id: 'cat-tech', name: '科技', expanded: true },
      ],
      feeds: [],
      articles: [],
      selectedView: 'all',
      selectedArticleId: null,
    });

    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    const categoryInput = screen.getByLabelText('分类');
    fireEvent.focus(categoryInput);
    fireEvent.click(categoryInput);

    const optionValues = (await screen.findAllByRole('option')).map((item) => item.textContent);

    expect(optionValues).toEqual(['未分类', '设计', '科技']);
  });

  it('shows success notification after add feed succeeds', async () => {
    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'Notify Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(screen.getByText('已添加订阅源')).toBeInTheDocument();
    });
  });

  it('shows error notification after add feed fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';

        if (url.includes('/api/feeds') && method === 'POST') {
          return jsonResponse({
            ok: false,
            error: {
              code: 'conflict',
              message: 'feed existed',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );

    renderWithNotifications();
    fireEvent.click(screen.getByLabelText('add-feed'));

    fireEvent.change(screen.getByPlaceholderText('例如：The Verge'), { target: { value: 'Notify Feed' } });
    const urlInput = screen.getByPlaceholderText('https://example.com/feed.xml');
    fireEvent.change(urlInput, {
      target: { value: 'https://example.com/success.xml' },
    });
    fireEvent.blur(urlInput);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() => {
      expect(screen.getByText(/操作失败/)).toBeInTheDocument();
    });
  });
});
